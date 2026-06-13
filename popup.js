document.getElementById('scanBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.houseScorer) {
          if (typeof window.houseScorer.sortAndMark === 'function') {
            window.houseScorer.sortAndMark();
          }
          if (typeof window.houseScorer.extractListings === 'function') {
            return window.houseScorer.extractListings();
          }
        }
        return { error: 'Content script not loaded. Try refreshing the page.' };
      }
    });

    const data = results[0].result;
    displayResults(data);
  } catch (err) {
    document.getElementById('status').textContent = 'Error: ' + err.message;
  }
});

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
    const locationLabel = l.matchedLocation || 'other';
    const breakdown = `Score: ${l.score}\nLocation (${locationLabel}): +${l.locationScore || 0}\nEnergy: +${l.energyScore || 0}\nRooms: +${l.roomScore || 0}`;
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
