var scanBtn = document.getElementById('scanBtn');

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

scanBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (isExposeUrl(tab.url)) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (window.houseScorer && typeof window.houseScorer.extractExposeData === 'function') {
            return window.houseScorer.extractExposeData();
          }
          return { error: 'Content script not loaded. Try refreshing the page.' };
        }
      });
      const data = results[0].result;
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

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.houseScorer) {
          var sortPromise = Promise.resolve();
          if (typeof window.houseScorer.sortAndMark === 'function') {
            sortPromise = window.houseScorer.sortAndMark();
          }
          return sortPromise.then(function () {
            if (typeof window.houseScorer.extractListings === 'function') {
              return window.houseScorer.extractListings();
            }
            return { error: 'Content script not loaded. Try refreshing the page.' };
          });
        }
        return Promise.resolve({ error: 'Content script not loaded. Try refreshing the page.' });
      }
    });

    const data = results[0].result;
    displayResults(data);

    if (data && data.listings && data.listings.length > 0 && data.listings[0].link) {
      chrome.tabs.create({ url: data.listings[0].link, active: false });
    }
  } catch (err) {
    document.getElementById('status').textContent = 'Error: ' + err.message;
  }
});

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

document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('results').innerHTML = '';
  document.getElementById('count').textContent = '';
  document.getElementById('status').textContent = 'Cleared.';
});

function displayResults(data) {
  const countEl = document.getElementById('count');
  const resultsEl = document.getElementById('results');
  const statusEl = document.getElementById('status');

  if (data.error) {
    statusEl.textContent = data.error;
    countEl.textContent = '';
    resultsEl.innerHTML = '';
    return;
  }

  statusEl.textContent = `Found ${data.count} listing(s) on the page.`;
  countEl.textContent = '';

  if (data.count === 0) {
    resultsEl.innerHTML = '<p>No listings detected.</p>';
    return;
  }

  let html = '';
  data.listings.forEach(l => {
    const isHighEff = l.energyClass === 'A' || l.energyClass === 'B';
    const scoreColor = l.score > 0 ? '#2563eb' : '#9ca3af';
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
    }
    const breakdown = 'Score: ' + l.score + explLines;
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
    html += `<div class="listing">
      <div style="display:flex;align-items:center;gap:8px;">
        <span title="${breakdown + locTitle}" style="background:${scoreColor};color:#fff;border-radius:12px;padding:2px 8px;font-size:12px;font-weight:bold;line-height:18px;cursor:pointer;">${l.score + locIndicator}</span>
        <h3 style="margin:0;">${l.title || 'No title'}</h3>
      </div>
      ${l.matchedLocation ? `<div class="detail"><strong>Location match:</strong> ${l.matchedLocation}</div>` : ''}
      ${l.badge ? `<div class="detail"><strong>Badge:</strong> ${l.badge}</div>` : ''}
      ${l.address ? `<div class="detail"><strong>Address:</strong> ${l.address}</div>` : ''}
      ${l.price ? `<div class="detail price">${l.price}</div>` : ''}
      ${l.area ? `<div class="detail"><strong>Area:</strong> ${l.area}</div>` : ''}
      ${l.rooms ? `<div class="detail"><strong>Rooms:</strong> ${l.rooms}</div>` : ''}
      ${l.energyClass ? `<div class="detail"><strong>Energy:</strong> <span class="${isHighEff ? 'energy-high' : ''}">${l.energyClass}</span></div>` : ''}
      ${l.link ? `<div class="detail"><a href="${l.link}" target="_blank">View listing</a></div>` : ''}
    </div>`;
  });

  resultsEl.innerHTML = html;
}
