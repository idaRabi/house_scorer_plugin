var scanBtn = document.getElementById('scanBtn');
var exposeView = document.getElementById('exposeView');

function isExposeUrl(url) {
  return url && url.indexOf('/expose/') !== -1;
}

chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
  var tab = tabs[0];
  if (tab && isExposeUrl(tab.url)) {
    scanBtn.textContent = 'Extract Expose Data';
    exposeView.style.display = 'block';
  }
});

scanBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (isExposeUrl(tab.url)) {
    extractExpose(tab);
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

async function extractExpose(tab) {
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
      return;
    }
    displayExposeData(data);
  } catch (err) {
    document.getElementById('status').textContent = 'Error: ' + err.message;
  }
}

function displayExposeData(data) {
  var fields = [
    { key: 'floor', label: 'Etage' },
    { key: 'hausgeld', label: 'Hausgeld' },
    { key: 'baujahr', label: 'Baujahr' },
    { key: 'objektzustand', label: 'Objektzustand' },
    { key: 'ausstattung', label: 'Ausstattung' },
    { key: 'heizungsart', label: 'Heizungsart' },
    { key: 'energietraeger', label: 'Wesentliche Energietrager' },
    { key: 'energieausweis', label: 'Energieausweis' },
    { key: 'energieausweistyp', label: 'Energieausweistyp' },
    { key: 'baujahrEnergieausweis', label: 'Baujahr lt. Energieausweis' },
    { key: 'endenergiebedarf', label: 'Endenergiebedarf' },
    { key: 'energieeffizienzklasse', label: 'Energieeffizienzklasse' }
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
    document.getElementById('status').textContent = 'No expose data found on this page.';
    return;
  }

  document.getElementById('status').textContent = 'Expose data extracted.';
  document.getElementById('exposeResults').innerHTML = html;
}

document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('results').innerHTML = '';
  document.getElementById('count').textContent = '';
  document.getElementById('exposeResults').innerHTML = '';
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
    const locationLabel = l.matchedLocation || 'other';
    const locScore = l.locationScore || 0;
    const enScore = l.energyScore || 0;
    const rmScore = l.roomScore || 0;
    const sign = function (v) { return v >= 0 ? '+' : ''; };
    const breakdown = 'Score: ' + l.score + '\nLocation (' + locationLabel + '): ' + sign(locScore) + locScore + '\nEnergy: ' + sign(enScore) + enScore + '\nRooms: ' + sign(rmScore) + rmScore;
    html += `<div class="listing">
      <div style="display:flex;align-items:center;gap:8px;">
        <span title="${breakdown}" style="background:${scoreColor};color:#fff;border-radius:12px;padding:2px 8px;font-size:12px;font-weight:bold;line-height:18px;cursor:pointer;">${l.score}</span>
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
