var SCORE_SERVER = 'http://localhost:3001';
var MAX_TABS = 15;
var WINDOW_MINUTES = 5;
var GAP_MS = 20000;
var BATCH_SIZE = 5;

function loadConfigFromPage(tab) {
  return chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: function () {
      var cfg = window.houseScorerConfig || {};
      return {
        maxTabsPerWindow: cfg.maxTabsPerWindow || 15,
        tabWindowMinutes: cfg.tabWindowMinutes || 5,
        tabOpenGapSeconds: cfg.tabOpenGapSeconds || 20,
        batchSize: cfg.batchSize || 5
      };
    }
  }).then(function (results) {
    var c = results[0].result;
    MAX_TABS = c.maxTabsPerWindow;
    WINDOW_MINUTES = c.tabWindowMinutes;
    GAP_MS = c.tabOpenGapSeconds * 1000;
    BATCH_SIZE = c.batchSize;
  });
}

var scanBtn = document.getElementById('scanBtn');
var isRunning = false;

function isExposeUrl(url) {
  return url && url.indexOf('/expose/') !== -1;
}

chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
  var tab = tabs[0];
  if (tab && isExposeUrl(tab.url)) {
    scanBtn.textContent = 'Extract Expose Data';
    document.getElementById('status').textContent = 'Expose scoring runs automatically. Click to re-fetch.';
  }
});

scanBtn.addEventListener('click', async function () {
  if (isRunning) return;

  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];
  if (!tab) return;

  if (isExposeUrl(tab.url)) {
    try {
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function () {
          if (window.houseScorer && typeof window.houseScorer.extractExposeData === 'function') {
            return window.houseScorer.extractExposeData();
          }
          return { error: 'Content script not loaded. Try refreshing the page.' };
        }
      });
      var data = results[0].result;
      if (data.error) {
        document.getElementById('status').textContent = data.error;
        document.getElementById('results').innerHTML = '';
        return;
      }
      displayExposeData(data);
      document.getElementById('status').textContent = 'Expose data re-extracted.';
    } catch (err) {
      document.getElementById('status').textContent = 'Error: ' + err.message;
    }
    return;
  }

  isRunning = true;
  scanBtn.disabled = true;
  scanBtn.textContent = 'Scanning...';
  document.getElementById('results').innerHTML = '';
  document.getElementById('status').textContent = 'Extracting listings...';

  try {
    await loadConfigFromPage(tab);
    await scanSearchPage(tab);
  } catch (err) {
    document.getElementById('status').textContent = 'Error: ' + err.message;
  } finally {
    isRunning = false;
    scanBtn.disabled = false;
    scanBtn.textContent = 'Scan Listings';
  }
});

async function scanSearchPage(searchTab) {
  var listings = await extractListingLinks(searchTab);
  if (!listings || listings.length === 0) {
    document.getElementById('status').textContent = 'No listings found on this page.';
    return;
  }

  var uncached = [];
  var statusEl = document.getElementById('status');

  statusEl.textContent = 'Checking cache for ' + listings.length + ' listings...';
  for (var i = 0; i < listings.length; i++) {
    try {
      var res = await fetch(SCORE_SERVER + '/expose-score/' + listings[i].obid);
      if (res.status === 404) {
        uncached.push(listings[i]);
      }
    } catch (e) {
      uncached.push(listings[i]);
    }
  }

  var totalToOpen = Math.min(uncached.length, MAX_TABS);
  if (totalToOpen === 0) {
    statusEl.textContent = 'All ' + listings.length + ' listings already cached. Re-scoring...';
    await resortAndExtract(searchTab);
    return;
  }

  await resortAndExtract(searchTab);

  statusEl.textContent = 'Found ' + listings.length + ' listings, ' + uncached.length + ' uncached. Sending ' + totalToOpen + ' to background worker...';

  chrome.runtime.sendMessage({
    type: 'openExposes',
    listings: uncached.slice(0, totalToOpen),
    config: {
      maxTabsPerWindow: MAX_TABS,
      tabWindowMinutes: WINDOW_MINUTES,
      tabOpenGapSeconds: GAP_MS / 1000,
      batchSize: BATCH_SIZE
    },
    searchTabId: searchTab.id
  });

  statusEl.textContent = 'Background opening ' + totalToOpen + ' pages (gap: ' + (GAP_MS / 1000) + 's). Popup can close \u2014 scores will auto-update.';

  setTimeout(function () {
    try { window.close(); } catch (e) {}
  }, 3000);
}

async function resortAndExtract(tab) {
  var results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: function () {
      if (!window.houseScorer || typeof window.houseScorer.sortAndMark !== 'function') {
        return Promise.resolve({ error: 'Content script not loaded.' });
      }
      return window.houseScorer.sortAndMark().then(function () {
        if (typeof window.houseScorer.extractListings === 'function') {
          return window.houseScorer.extractListings();
        }
        return { error: 'extractListings not available.' };
      });
    }
  });

  var data = results[0].result;
  if (data && !data.error) {
    displayResults(data);
  } else if (data && data.error) {
    document.getElementById('status').textContent = data.error;
  }
}

async function extractListingLinks(tab) {
  var results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: function () {
      var cards = document.querySelectorAll('.listing-card[data-obid]');
      var out = [];
      cards.forEach(function (card) {
        var obid = card.getAttribute('data-obid');
        var linkEl = card.querySelector('[data-testid="attributeSection"]');
        var link = linkEl ? linkEl.closest('a') : null;
        if (obid && link && link.href) {
          out.push({ obid: obid, link: link.href });
        }
      });
      return out;
    }
  });
  return results[0].result;
}

function displayExposeData(data) {
  var fields = [
    { key: 'address', label: 'Address' },
    { key: 'floor', label: 'Etage' },
    { key: 'maintenanceFee', label: 'Hausgeld' },
    { key: 'constructionYear', label: 'Baujahr' },
    { key: 'condition', label: 'Objektzustand' },
    { key: 'ausstattung', label: 'Ausstattung' },
    { key: 'heatingType', label: 'Heizungsart' },
    { key: 'primaryEnergySource', label: 'Wesentliche Energietrager' },
    { key: 'energyCertificateStatus', label: 'Energieausweis' },
    { key: 'energyCertificateType', label: 'Energieausweistyp' },
    { key: 'baujahrEnergieausweis', label: 'Baujahr lt. Energieausweis' },
    { key: 'endenergiebedarf', label: 'Endenergiebedarf' },
    { key: 'energyCertificate', label: 'Energieklasse' }
  ];

  var hasAny = false;
  var html = '';
  fields.forEach(function (f) {
    if (data[f.key]) {
      hasAny = true;
      html += '<div class="expose-row"><span class="expose-label">' + f.label + '</span><span class="expose-value">' + data[f.key] + '</span></div>';
    }
  });

  if (!hasAny) {
    document.getElementById('results').innerHTML = '<p>No expose data found on this page.</p>';
    return;
  }

  document.getElementById('results').innerHTML = html;
}

document.getElementById('clearBtn').addEventListener('click', function () {
  document.getElementById('results').innerHTML = '';
  document.getElementById('count').textContent = '';
  document.getElementById('status').textContent = 'Cleared.';
});

function displayResults(data) {
  var countEl = document.getElementById('count');
  var resultsEl = document.getElementById('results');
  var statusEl = document.getElementById('status');

  if (data.error) {
    statusEl.textContent = data.error;
    countEl.textContent = '';
    resultsEl.innerHTML = '';
    return;
  }

  statusEl.textContent = 'Found ' + data.count + ' listing(s) on the page.';
  countEl.textContent = '';

  if (data.count === 0) {
    resultsEl.innerHTML = '<p>No listings detected.</p>';
    return;
  }

  var html = '';
  data.listings.forEach(function (l) {
    var isHighEff = l.energyClass === 'A' || l.energyClass === 'B';
    var scoreColor = l.score > 0 ? '#2563eb' : '#9ca3af';
    var explLines = '';
    if (l.explanation) {
      var expl = l.explanation;
      if (expl.location) explLines += '\n' + expl.location;
      if (expl.energy) explLines += '\n' + expl.energy;
      if (expl.rooms) explLines += '\n' + expl.rooms;
      if (expl.accessibility) explLines += '\n' + expl.accessibility;
      if (expl.construction) explLines += '\n' + expl.construction;
      if (expl.heatingType) explLines += '\n' + expl.heatingType;
      if (expl.maintenanceFee) explLines += '\n' + expl.maintenanceFee;
      if (expl.supermarket) explLines += '\n' + expl.supermarket;
      if (expl.transit) explLines += '\n' + expl.transit;
      if (expl.commuteWork) explLines += '\n' + expl.commuteWork;
      if (expl.commuteWifeWork) explLines += '\n' + expl.commuteWifeWork;
    }
    var locIndicator = '';
    var locTitle = '';
    if (l.locations) {
      var loc = l.locations;
      var locParts = [];
      if (loc.transitStations && loc.transitStations.nearest && loc.transitStations.nearest.name) {
        locParts.push('Transit: ' + loc.transitStations.nearest.name);
      }
      var marketTotal = 0;
      if (loc.supermarkets) {
        var mks = Object.keys(loc.supermarkets);
        for (var mi = 0; mi < mks.length; mi++) {
          var sm = loc.supermarkets[mks[mi]];
          marketTotal += (sm.within500m && sm.within500m.count) || 0;
        }
      }
      if (marketTotal > 0) {
        locParts.push('Supermarkets: ' + marketTotal + ' within 500m');
      }
      if (locParts.length > 0) {
        locIndicator = ' \uD83D\uDCCD';
        locTitle = '\n\nLocation:\n' + locParts.join('\n');
      }
    }
    html += '<div class="listing">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span title="Score: ' + l.score + explLines + locTitle + '" style="background:' + scoreColor + ';color:#fff;border-radius:12px;padding:2px 8px;font-size:12px;font-weight:bold;line-height:18px;cursor:pointer;">' + l.score + locIndicator + '</span>' +
        '<h3 style="margin:0;">' + (l.title || 'No title') + '</h3>' +
      '</div>' +
      (l.matchedLocation ? '<div class="detail"><strong>Location match:</strong> ' + l.matchedLocation + '</div>' : '') +
      (l.badge ? '<div class="detail"><strong>Badge:</strong> ' + l.badge + '</div>' : '') +
      (l.address ? '<div class="detail"><strong>Address:</strong> ' + l.address + '</div>' : '') +
      (l.price ? '<div class="detail price">' + l.price + '</div>' : '') +
      (l.area ? '<div class="detail"><strong>Area:</strong> ' + l.area + '</div>' : '') +
      (l.rooms ? '<div class="detail"><strong>Rooms:</strong> ' + l.rooms + '</div>' : '') +
      (l.energyClass ? '<div class="detail"><strong>Energy:</strong> <span class="' + (isHighEff ? 'energy-high' : '') + '">' + l.energyClass + '</span></div>' : '') +
      (l.link ? '<div class="detail"><a href="' + l.link + '" target="_blank">View listing</a></div>' : '') +
    '</div>';
  });

  resultsEl.innerHTML = html;
}
