function getConfig() {
  return window.houseScorerConfig || {
    locationScores: {},
    missingLocationScore: 0,
    energyScores: {},
    roomScores: {}
  };
}

function computeScore(listing) {
  var config = getConfig();
  var score = 0;
  var matchedLocation = null;

  if (listing.address) {
    var addrLower = listing.address.toLowerCase();
    var locations = config.locationScores;
    for (var loc in locations) {
      if (locations.hasOwnProperty(loc) && addrLower.indexOf(loc.toLowerCase()) !== -1) {
        score += locations[loc];
        matchedLocation = loc;
        break;
      }
    }
    if (!matchedLocation) {
      score += config.missingLocationScore;
    }
  } else {
    score += config.missingLocationScore;
  }

  if (listing.energyClass && config.energyScores) {
    var ecScore = config.energyScores[listing.energyClass];
    if (typeof ecScore === 'number') {
      score += ecScore;
    }
  }

  if (listing.rooms && config.roomScores) {
    var roomMatch = listing.rooms.match(/(\d+)/);
    if (roomMatch) {
      var roomCount = roomMatch[1];
      var rcScore = config.roomScores[roomCount];
      if (typeof rcScore === 'number') {
        score += rcScore;
      }
    }
  }

  return { total: score, matchedLocation: matchedLocation };
}

function addScoreBadge(card, score) {
  var existing = card.querySelector('.house-scorer-score');
  if (existing) existing.remove();

  var badge = document.createElement('div');
  badge.className = 'house-scorer-score';
  badge.title = 'House Scorer rating';
  badge.style.position = 'absolute';
  badge.style.top = '8px';
  badge.style.left = '8px';
  badge.style.zIndex = '10';
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
  badge.textContent = score;

  card.style.position = 'relative';
  card.appendChild(badge);
}

function addEnergyBadges() {
  var cards = document.querySelectorAll('.listing-card[data-obid]');
  cards.forEach(function (card) {
    if (card.querySelector('.house-scorer-badge')) return;

    var energyLabel =
      card.querySelector('.eec-label-A, .eec-label-B');

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
  cards.forEach(function (card) {
    var addressEl = card.querySelector('[data-testid="hybridViewAddress"]');
    var address = addressEl ? addressEl.textContent.trim() : null;
    var energyEl = card.querySelector('.eec-label-A, .eec-label-B, .eec-label-C, .eec-label-D, .eec-label-E, .eec-label-F, .eec-label-G, .eec-label-H');
    var energyClass = energyEl ? energyEl.textContent.trim() : null;
    var attributesContainer = card.querySelector('[data-testid="attributes"]');
    var ddEls = attributesContainer ? attributesContainer.querySelectorAll('dd') : [];
    var rooms = null;
    ddEls.forEach(function (dd) {
      var text = dd.textContent.trim();
      if (text.indexOf('Zi.') !== -1) {
        rooms = text;
      }
    });
    var result = computeScore({ address: address, energyClass: energyClass, rooms: rooms });
    addScoreBadge(card, result.total);
  });
}

function extractListings() {
  var listings = [];
  var cards = document.querySelectorAll('.listing-card[data-obid]');

  if (cards.length === 0) {
    return { error: 'No listing cards found on this page.', count: 0, listings: [] };
  }

  cards.forEach(function (card) {
    var obid = card.getAttribute('data-obid');
    var titleEl = card.querySelector('[data-testid="headline"]');
    var addressEl = card.querySelector('[data-testid="hybridViewAddress"]');
    var address = addressEl ? addressEl.textContent.trim() : null;
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

    var scoreResult = computeScore({ address: address, energyClass: energyClass, rooms: rooms });

    listings.push({
      obid: obid,
      title: titleEl ? titleEl.textContent.trim() : null,
      address: address,
      price: price,
      area: area,
      rooms: rooms,
      energyClass: energyClass,
      badge: badgeText,
      score: scoreResult.total,
      matchedLocation: scoreResult.matchedLocation,
      link: linkEl ? linkEl.href : null
    });
  });

  return { count: listings.length, listings: listings };
}

try { addEnergyBadges(); } catch (e) {}
scoreAndMarkAll();

window.houseScorer = { extractListings: extractListings };
