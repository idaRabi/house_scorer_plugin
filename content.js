var SCORE_SERVER = 'http://localhost:3001';

function fetchScore(obid, data) {
  return fetch(SCORE_SERVER + '/expose-score/' + obid, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: data.address,
      rooms: data.rooms,
      energyCertificate: data.energyCertificate,
      floor: data.floor || null,
      maintenanceFee: data.maintenanceFee || null,
      constructionYear: data.constructionYear || null,
      condition: data.condition || null,
      heatingType: data.heatingType || null,
      primaryEnergySource: data.primaryEnergySource || null,
      energyCertificateStatus: data.energyCertificateStatus || null,
      energyCertificateType: data.energyCertificateType || null,
      hasElevator: data.hasElevator || null,
      area: data.area || null
    })
  })
  .then(function (res) {
    if (!res.ok) throw new Error('Server error: ' + res.status);
    return res.json();
  })
  .catch(function () {
    return { id: obid, score: 0, breakdown: { location: 0, energy: 0, rooms: 0 }, matchedLocation: null, explanation: {} };
  });
}

function extractListingData(card) {
  var obid = card.getAttribute('data-obid');
  var titleEl = card.querySelector('[data-testid="headline"]');
  var addressEl = card.querySelector('[data-testid="hybridViewAddress"]');
  var attributesContainer = card.querySelector('[data-testid="attributes"]');
  var ddEls = attributesContainer ? attributesContainer.querySelectorAll('dd') : [];

  var price = null;
  var area = null;
  var rooms = null;
  ddEls.forEach(function (dd) {
    var text = dd.textContent.trim();
    if (text.indexOf('\u20AC') !== -1) {
      price = text;
    } else if (text.indexOf('m\u00B2') !== -1) {
      area = text;
    } else if (text.indexOf('Zi.') !== -1) {
      rooms = text;
    }
  });

  var energyEl = card.querySelector('.eec-label-A, .eec-label-B, .eec-label-C, .eec-label-D, .eec-label-E, .eec-label-F, .eec-label-G, .eec-label-H');
  var energyClass = energyEl ? energyEl.textContent.trim() : null;

  var badgeEl = card.querySelector('.indicator span');
  var badgeText = badgeEl ? badgeEl.textContent.trim() : null;

  var attrSection = card.querySelector('[data-testid="attributeSection"]');
  var linkEl = attrSection ? attrSection.closest('a') : null;

  return {
    obid: obid,
    title: titleEl ? titleEl.textContent.trim() : null,
    address: addressEl ? addressEl.textContent.trim() : null,
    price: price,
    area: area,
    rooms: rooms,
    energyClass: energyClass,
    badge: badgeText,
    link: linkEl ? linkEl.href : null
  };
}

function addScoreBadge(card, serverResult) {
  var existing = card.querySelector('.house-scorer-score');
  if (existing) existing.remove();
  var existingTip = card.querySelector('.house-scorer-tooltip');
  if (existingTip) existingTip.remove();

  var score = serverResult.score;

  var badge = document.createElement('div');
  badge.className = 'house-scorer-score';
  badge.style.position = 'absolute';
  badge.style.top = '8px';
  badge.style.left = '8px';
  badge.style.zIndex = '11';
  badge.style.minWidth = '28px';
  badge.style.height = '28px';
  badge.style.borderRadius = '14px';
  badge.style.padding = '0 8px';
  badge.style.background = score > 0 ? '#2563eb' : '#9ca3af';
  badge.style.color = '#fff';
  badge.style.display = 'flex';
  badge.style.alignItems = 'center';
  badge.style.justifyContent = 'center';
  badge.style.fontSize = '14px';
  badge.style.fontWeight = 'bold';
  badge.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
  badge.style.boxSizing = 'border-box';
  badge.style.lineHeight = '28px';
  badge.style.cursor = 'pointer';
  badge.textContent = score;

  var tooltip = document.createElement('div');
  tooltip.className = 'house-scorer-tooltip';
  tooltip.style.display = 'none';
  tooltip.style.position = 'absolute';
  tooltip.style.top = '40px';
  tooltip.style.left = '8px';
  tooltip.style.zIndex = '20';
  tooltip.style.background = '#1f2937';
  tooltip.style.color = '#f9fafb';
  tooltip.style.padding = '8px 12px';
  tooltip.style.borderRadius = '6px';
  tooltip.style.fontSize = '13px';
  tooltip.style.fontFamily = 'Arial, sans-serif';
  tooltip.style.lineHeight = '1.5';
  tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';

  var expl = serverResult.explanation || {};
  var explLines = '';
  if (expl.location) explLines += '<div>' + expl.location + '</div>';
  if (expl.energy) explLines += '<div>' + expl.energy + '</div>';
  if (expl.rooms) explLines += '<div>' + expl.rooms + '</div>';
  if (expl.accessibility) explLines += '<div>' + expl.accessibility + '</div>';
  if (expl.construction) explLines += '<div>' + expl.construction + '</div>';
  if (expl.heatingType) explLines += '<div>' + expl.heatingType + '</div>';
  if (expl.maintenanceFee) explLines += '<div>' + expl.maintenanceFee + '</div>';

  tooltip.innerHTML =
    '<div style="margin-bottom:4px;"><b>Score: ' + score + '</b></div>' + explLines;

  badge.addEventListener('mouseenter', function () {
    tooltip.style.display = 'block';
  });
  badge.addEventListener('mouseleave', function () {
    tooltip.style.display = 'none';
  });

  card.style.position = 'relative';
  card.appendChild(badge);
  card.appendChild(tooltip);
}

function addEnergyBadges() {
  var cards = document.querySelectorAll('.listing-card[data-obid]');
  cards.forEach(function (card) {
    if (card.querySelector('.house-scorer-badge')) return;
    var energyLabel = card.querySelector('.eec-label-A, .eec-label-B');
    if (!energyLabel) return;

    var badge = document.createElement('div');
    badge.className = 'house-scorer-badge';
    badge.title = 'High energy efficiency';
    badge.style.position = 'absolute';
    badge.style.top = '8px';
    badge.style.right = '8px';
    badge.style.zIndex = '10';
    badge.style.width = '28px';
    badge.style.height = '28px';
    badge.style.borderRadius = '50%';
    badge.style.background = '#16a34a';
    badge.style.color = '#fff';
    badge.style.display = 'flex';
    badge.style.alignItems = 'center';
    badge.style.justifyContent = 'center';
    badge.style.fontSize = '18px';
    badge.style.fontWeight = 'bold';
    badge.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
    badge.textContent = '\u2713';

    card.style.position = 'relative';
    card.appendChild(badge);
  });
}

function scoreAndMarkAll() {
  var cards = document.querySelectorAll('.listing-card[data-obid]');
  var promises = [];
  cards.forEach(function (card) {
    var data = extractListingData(card);
    var p = fetchScore(data.obid, {
      address: data.address,
      rooms: data.rooms,
      energyCertificate: data.energyClass,
      area: data.area
    }).then(function (result) {
      addScoreBadge(card, result);
    });
    promises.push(p);
  });
  return Promise.all(promises);
}

function sortByScore() {
  var cards = document.querySelectorAll('.listing-card[data-obid]');
  if (cards.length < 2) return Promise.resolve();

  var container = cards[0].parentElement;
  if (!container) return Promise.resolve();

  var promises = [];
  cards.forEach(function (card) {
    var data = extractListingData(card);
    var p = fetchScore(data.obid, {
      address: data.address,
      rooms: data.rooms,
      energyCertificate: data.energyClass,
      area: data.area
    }).then(function (result) {
      return { card: card, score: result.score };
    });
    promises.push(p);
  });

  return Promise.all(promises).then(function (scored) {
    scored.sort(function (a, b) { return b.score - a.score; });
    var fragment = document.createDocumentFragment();
    scored.forEach(function (item) {
      fragment.appendChild(item.card);
    });
    container.appendChild(fragment);
  });
}

function extractExposeData() {
  var data = {};

  var pathParts = window.location.pathname.split('/');
  data.exposeId = pathParts[pathParts.length - 1];

  if (window.IS24 && window.IS24.expose && window.IS24.expose.locationAddress) {
    var loc = window.IS24.expose.locationAddress;
    data.address = loc.street + ' ' + loc.houseNumber + ', ' + loc.zip + ' ' + loc.city;
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

  var ausstattungEl = document.querySelector('.is24qa-qualitaet-der-ausstattung');
  if (ausstattungEl) data.ausstattung = ausstattungEl.textContent.trim();

  var heizungEl = document.querySelector('.is24qa-heizungsart');
  if (heizungEl) data.heatingType = heizungEl.textContent.trim();

  var energietraegerEl = document.querySelector('.is24qa-wesentliche-energietraeger');
  if (energietraegerEl) data.primaryEnergySource = energietraegerEl.textContent.trim();

  var energieausweisEl = document.querySelector('.is24qa-energieausweis');
  if (energieausweisEl) data.energyCertificateStatus = energieausweisEl.textContent.trim();

  var ausweistypEl = document.querySelector('.is24qa-energieausweistyp');
  if (ausweistypEl) data.energyCertificateType = ausweistypEl.textContent.trim();

  var baujahrEAEl = document.querySelector('.is24qa-baujahr-laut-energieausweis');
  if (baujahrEAEl) data.baujahrEnergieausweis = baujahrEAEl.textContent.trim();

  var endenergieEl = document.querySelector('.is24qa-endenergiebedarf');
  if (endenergieEl) data.endenergiebedarf = endenergieEl.textContent.trim();

  var liftLabel = document.querySelector('[data-qa="is24qa-lift-label"]');
  if (liftLabel) {
    var indicator = liftLabel.querySelector('[data-testid="indicator-container"]');
    data.hasElevator = !!indicator;
  }

  var areaEl = document.querySelector('.is24qa-wohnflaeche-ca');
  if (areaEl) data.area = areaEl.textContent.trim();

  return data;
}

function fetchExposeScore(data) {
  return fetch(SCORE_SERVER + '/expose-score/' + data.exposeId, {
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
      area: data.area
    })
  })
  .then(function (res) {
    if (!res.ok) throw new Error('Server error: ' + res.status);
    return res.json();
  })
  .catch(function () {
    return { id: data.exposeId, score: 0, breakdown: { location: 0, energy: 0, rooms: 0 }, matchedLocation: null, input: data };
  });
}

function addExposeScoreOverlay(result) {
  var existing = document.querySelector('.house-scorer-expose-overlay');
  if (existing) existing.remove();

  var score = result.score;
  var scoreColor = score > 0 ? '#2563eb' : '#9ca3af';

  var expl = result.explanation || {};
  var explLines = '';
  if (expl.location) explLines += '<div>' + expl.location + '</div>';
  if (expl.energy) explLines += '<div>' + expl.energy + '</div>';
  if (expl.rooms) explLines += '<div>' + expl.rooms + '</div>';
  if (expl.accessibility) explLines += '<div>' + expl.accessibility + '</div>';
  if (expl.construction) explLines += '<div>' + expl.construction + '</div>';
  if (expl.heatingType) explLines += '<div>' + expl.heatingType + '</div>';
  if (expl.maintenanceFee) explLines += '<div>' + expl.maintenanceFee + '</div>';

  var overlay = document.createElement('div');
  overlay.className = 'house-scorer-expose-overlay';
  overlay.style.position = 'fixed';
  overlay.style.bottom = '16px';
  overlay.style.right = '16px';
  overlay.style.zIndex = '9999';
  overlay.style.background = '#1f2937';
  overlay.style.color = '#f9fafb';
  overlay.style.padding = '12px 16px';
  overlay.style.borderRadius = '8px';
  overlay.style.fontFamily = 'Arial, sans-serif';
  overlay.style.fontSize = '13px';
  overlay.style.lineHeight = '1.6';
  overlay.style.boxShadow = '0 4px 16px rgba(0,0,0,0.35)';
  overlay.style.maxWidth = '300px';

  overlay.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
      '<span style="background:' + scoreColor + ';color:#fff;border-radius:14px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;">' + score + '</span>' +
      '<b style="font-size:14px;">House Score</b>' +
    '</div>' + explLines;

  document.body.appendChild(overlay);

  setTimeout(function () {
    overlay.style.opacity = '0.85';
    overlay.style.transition = 'opacity 0.5s';
  }, 100);
}

function autoScoreExpose() {
  var data = extractExposeData();
  if (!data.exposeId) return;
  fetchExposeScore(data).then(function (result) {
    addExposeScoreOverlay(result);
  });
}

function isExposePage() {
  return window.location.pathname.indexOf('/expose/') !== -1;
}

function extractListings() {
  var cards = document.querySelectorAll('.listing-card[data-obid]');
  if (cards.length === 0) {
    return Promise.resolve({ error: 'No listing cards found on this page.', count: 0, listings: [] });
  }

  var promises = [];
  cards.forEach(function (card) {
    var data = extractListingData(card);
    var p = fetchScore(data.obid, {
      address: data.address,
      rooms: data.rooms,
      energyCertificate: data.energyClass,
      area: data.area
    }).then(function (result) {
      return {
        obid: data.obid,
        title: data.title,
        address: data.address,
        price: data.price,
        area: data.area,
        rooms: data.rooms,
        energyClass: data.energyClass,
        badge: data.badge,
        score: result.score,
        matchedLocation: result.matchedLocation,
        locationScore: result.breakdown.location,
        energyScore: result.breakdown.energy,
        roomScore: result.breakdown.rooms,
        explanation: result.explanation,
        link: data.link
      };
    });
    promises.push(p);
  });

  return Promise.all(promises).then(function (listings) {
    return { count: listings.length, listings: listings };
  });
}

function sortAndMark() {
  return sortByScore().then(function () {
    try { addEnergyBadges(); } catch (e) {}
    return scoreAndMarkAll();
  });
}

if (isExposePage()) {
  autoScoreExpose();
} else {
  sortAndMark();
}

window.houseScorer = { extractListings: extractListings, sortAndMark: sortAndMark, extractExposeData: extractExposeData, isExposePage: isExposePage };
