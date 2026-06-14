var SCORE_SERVER = 'http://localhost:3001';

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type === 'openExposes') {
    openExposes(msg.listings, msg.config, msg.searchTabId);
    sendResponse({ started: true });
  }
  return true;
});

async function openExposes(listings, config, searchTabId) {
  var maxTabs = config.maxTabsPerWindow || 15;
  var gapMs = (config.tabOpenGapSeconds || 20) * 1000;
  var batchSize = config.batchSize || 5;

  var totalToOpen = Math.min(listings.length, maxTabs);
  var idx = 0;

  while (idx < totalToOpen) {
    var batchEnd = Math.min(idx + batchSize, totalToOpen);
    var batchTabs = [];

    for (var i = idx; i < batchEnd; i++) {
      try {
        var tab = await chrome.tabs.create({ url: listings[i].link, active: false });
        batchTabs.push({ id: tab.id, obid: listings[i].obid });
        console.log('[HouseScorer] Opened ' + (i + 1) + '/' + totalToOpen + ': ' + listings[i].obid);
      } catch (e) {
        console.error('[HouseScorer] Tab creation error:', e);
      }
    }

    console.log('[HouseScorer] Batch ' + (idx + 1) + '-' + batchEnd + ': waiting 15s for pages to load...');
    await delay(15000);

    for (var j = 0; j < batchTabs.length; j++) {
      try {
        var results = await chrome.scripting.executeScript({
          target: { tabId: batchTabs[j].id },
          func: scoreExposePage
        });
        var data = results[0].result;
        if (data && data.exposeId) {
          var res = await fetch(SCORE_SERVER + '/expose-score/' + data.exposeId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: data.address,
              rooms: data.rooms,
              energyCertificate: data.energyCertificate,
              floor: data.floor,
              maintenanceFee: data.maintenanceFee,
              constructionYear: data.constructionYear,
              condition: data.condition,
              heatingType: data.heatingType,
              primaryEnergySource: data.primaryEnergySource,
              energyCertificateStatus: data.energyCertificateStatus,
              energyCertificateType: data.energyCertificateType,
              hasElevator: data.hasElevator || null,
              area: data.area,
              latitude: data.latitude || null,
              longitude: data.longitude || null
            })
          });
          console.log('[HouseScorer] Scored ' + data.exposeId + ': ' + res.status);
        }
      } catch (e) {
        console.error('[HouseScorer] Error processing ' + batchTabs[j].obid + ':', e.message);
      }
    }

    for (var k = 0; k < batchTabs.length; k++) {
      try { chrome.tabs.remove(batchTabs[k].id); } catch (e) {}
    }

    idx = batchEnd;
    if (idx < totalToOpen) {
      console.log('[HouseScorer] Waiting ' + (gapMs / 1000) + 's before next batch...');
      await delay(gapMs);
    }
  }

  console.log('[HouseScorer] Done. Triggering re-sort on search tab ' + searchTabId);
  try {
    await chrome.scripting.executeScript({
      target: { tabId: searchTabId },
      func: function () {
        if (window.houseScorer && typeof window.houseScorer.sortAndMark === 'function') {
          window.houseScorer.sortAndMark();
        }
      }
    });
    console.log('[HouseScorer] Resort triggered');
  } catch (e) {
    console.error('[HouseScorer] Resort failed:', e.message);
  }
}

function scoreExposePage() {
  var data = {};

  var pathParts = window.location.pathname.split('/');
  data.exposeId = pathParts[pathParts.length - 1];

  var heyImmoEl = document.querySelector('script[data-heyimmo-context="general"]');
  if (heyImmoEl) {
    try {
      var hi = JSON.parse(heyImmoEl.textContent);
      if (hi.addressAndLocation) {
        var al = hi.addressAndLocation;
        if (al.street) {
          data.address = al.street + ' ' + al.houseNumber + ', ' + al.postcode + ' ' + al.city;
        }
        if (typeof al.latitude === 'number') data.latitude = al.latitude;
        if (typeof al.longitude === 'number') data.longitude = al.longitude;
      }
    } catch (e) {}
  }

  var roomsEl = document.querySelector('.is24qa-zimmer');
  if (roomsEl) data.rooms = roomsEl.textContent.trim();

  var eecImg = document.querySelector('.is24qa-energieeffizienzklasse img');
  if (eecImg) data.energyCertificate = eecImg.alt;

  var etageEl = document.querySelector('.is24qa-etage');
  if (etageEl) data.floor = etageEl.textContent.trim();

  var hausgeldEl = document.querySelector('.is24qa-hausgeld');
  if (hausgeldEl) data.maintenanceFee = hausgeldEl.textContent.trim();

  var baujahrEl = document.querySelector('.is24qa-baujahr');
  if (baujahrEl) data.constructionYear = baujahrEl.textContent.trim();

  var zustandEl = document.querySelector('.is24qa-objektzustand');
  if (zustandEl) data.condition = zustandEl.textContent.trim();

  var heizungEl = document.querySelector('.is24qa-heizungsart');
  if (heizungEl) data.heatingType = heizungEl.textContent.trim();

  var energietraegerEl = document.querySelector('.is24qa-wesentliche-energietraeger');
  if (energietraegerEl) data.primaryEnergySource = energietraegerEl.textContent.trim();

  var energieausweisEl = document.querySelector('.is24qa-energieausweis');
  if (energieausweisEl) data.energyCertificateStatus = energieausweisEl.textContent.trim();

  var ausweistypEl = document.querySelector('.is24qa-energieausweistyp');
  if (ausweistypEl) data.energyCertificateType = ausweistypEl.textContent.trim();

  var areaEl = document.querySelector('.is24qa-wohnflaeche-ca');
  if (areaEl) data.area = areaEl.textContent.trim();

  var liftLabel = document.querySelector('[data-qa="is24qa-lift-label"]');
  if (liftLabel) {
    data.hasElevator = !!liftLabel.querySelector('[data-testid="indicator-container"]');
  }

  return data;
}
