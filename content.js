var SCORE_SERVER = 'http://localhost:3001';

function fetchCachedOrCompute(id, postFn) {
  return fetch(SCORE_SERVER + '/expose-score/' + id)
    .then(function (res) {
      if (res.ok) return res.json();
      if (res.status === 404) return postFn();
      throw new Error('Server error: ' + res.status);
    })
    .catch(function (err) {
      if (err.message && err.message.indexOf('Server error') !== -1) {
        return { id: id, score: 0, breakdown: { location: 0, energy: 0, rooms: 0 }, matchedLocation: null, explanation: {} };
      }
      return postFn().catch(function () {
        return { id: id, score: 0, breakdown: { location: 0, energy: 0, rooms: 0 }, matchedLocation: null, explanation: {} };
      });
    });
}

function fetchScore(obid, data) {
  var postData = {
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
    area: data.area || null,
    latitude: data.latitude || null,
    longitude: data.longitude || null
  };

  return fetchCachedOrCompute(obid, function () {
    return fetch(SCORE_SERVER + '/score/' + obid, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postData)
    }).then(function (res) {
      if (!res.ok) throw new Error('Server error: ' + res.status);
      return res.json();
    });
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

function classifyTransit(station) {
  if (!station || !station.types) return 'other';
  var t = station.types;
  for (var i = 0; i < t.length; i++) {
    if (t[i] === 'subway_station') return 'U-Bahn';
    if (t[i] === 'train_station') return 'S-Bahn';
    if (t[i] === 'tram_stop' || t[i] === 'light_rail_station') return 'Tram';
    if (t[i] === 'bus_station' || t[i] === 'bus_stop') return 'Bus';
  }
  return 'other';
}

function collectTransitLines(stations) {
  var lines = {};
  if (!stations) return lines;
  for (var i = 0; i < stations.length; i++) {
    var tl = stations[i].transitLines;
    if (tl && tl.length) {
      for (var j = 0; j < tl.length; j++) {
        var ln = tl[j].line || tl[j];
        if (ln) lines[ln] = true;
      }
    }
  }
  return Object.keys(lines).sort(function (a, b) {
    var na = parseInt(a), nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

function buildTransitCounts(stations) {
  var counts = { 'U-Bahn': 0, 'S-Bahn': 0, 'Tram': 0, 'Bus': 0, other: 0 };
  if (!stations) return counts;
  for (var i = 0; i < stations.length; i++) {
    var cat = classifyTransit(stations[i]);
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

function formatTransitCounts(counts) {
  var parts = [];
  if (counts['U-Bahn'] > 0) parts.push(counts['U-Bahn'] + ' U-Bahn');
  if (counts['S-Bahn'] > 0) parts.push(counts['S-Bahn'] + ' S-Bahn');
  if (counts['Tram'] > 0) parts.push(counts['Tram'] + ' Tram');
  if (counts['Bus'] > 0) parts.push(counts['Bus'] + ' Bus');
  if (counts.other > 0) parts.push(counts.other + ' other');
  return parts.join(', ');
}

function buildLocationTooltip(loc) {
  var html = '';
  if (!loc) return html;

  if (loc.commute) {
    html += '<div style="margin-bottom:6px;"><b>Commute</b></div>';
    var commuteKeys = Object.keys(loc.commute);
    for (var c = 0; c < commuteKeys.length; c++) {
      var ck = commuteKeys[c];
      var cm = loc.commute[ck];
      if (cm && cm.durationText) {
        html += '<div>' + ck.replace(/_/g, ' ') + ': ' + cm.durationText + ' (' + cm.distanceText + ')</div>';
        if (cm.transitLines && cm.transitLines.length) {
          for (var tl = 0; tl < cm.transitLines.length; tl++) {
            var tln = cm.transitLines[tl];
            html += '<div style="padding-left:12px;font-size:11px;color:#aaa;">' + tln.line + ': ' + tln.departure + ' \u2192 ' + tln.arrival + '</div>';
          }
        }
      }
    }
    html += '<div style="margin-bottom:6px;"></div>';
  }

  if (loc.transitStations) {
    html += '<div style="margin-bottom:4px;"><b>Transit</b></div>';
    var ts = loc.transitStations;
    if (ts.within200m && ts.within200m.count > 0) {
      var c200 = buildTransitCounts(ts.within200m.stations);
      var l200 = collectTransitLines(ts.within200m.stations);
      html += '<div>200m: ' + ts.within200m.count + ' (' + formatTransitCounts(c200) + ')' + (l200.length > 0 ? ' [' + l200.join(', ') + ']' : '') + '</div>';
    }
    if (ts.within500m && ts.within500m.count > 0) {
      var c500 = buildTransitCounts(ts.within500m.stations);
      var l500 = collectTransitLines(ts.within500m.stations);
      html += '<div>500m: ' + ts.within500m.count + ' (' + formatTransitCounts(c500) + ')' + (l500.length > 0 ? ' [' + l500.join(', ') + ']' : '') + '</div>';
    }
    if (ts.within1000m && ts.within1000m.count > 0) {
      var c1000 = buildTransitCounts(ts.within1000m.stations);
      var l1000 = collectTransitLines(ts.within1000m.stations);
      html += '<div>1km: ' + ts.within1000m.count + ' (' + formatTransitCounts(c1000) + ')' + (l1000.length > 0 ? ' [' + l1000.join(', ') + ']' : '') + '</div>';
    }
    if (ts.nearest && ts.nearest.name) {
      html += '<div>Nearest: ' + ts.nearest.name + '</div>';
    }
    html += '<div style="margin-bottom:6px;"></div>';
  }

  if (loc.supermarkets) {
    html += '<div style="margin-bottom:4px;"><b>Supermarkets</b> (within 1km)</div>';
    var marketKeys = Object.keys(loc.supermarkets);
    for (var m = 0; m < marketKeys.length; m++) {
      var mk = marketKeys[m];
      var sm = loc.supermarkets[mk];
      var count1000 = (sm.within1000m && sm.within1000m.count) || 0;
      var count500 = (sm.within500m && sm.within500m.count) || 0;
      if (count1000 > 0) {
        html += '<div>' + mk + ': ' + count500 + ' within 500m, ' + count1000 + ' within 1km</div>';
      }
    }
  }

  return html;
}

function buildLocationButton(locations) {
  var wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';

  var btn = document.createElement('span');
  btn.textContent = '\uD83D\uDCCD';
  btn.style.cursor = 'pointer';
  btn.style.fontSize = '14px';
  btn.style.lineHeight = '28px';
  btn.style.padding = '0 4px';

  var tip = document.createElement('div');
  tip.style.display = 'none';
  tip.style.position = 'fixed';
  tip.style.zIndex = '99999';
  tip.style.background = '#1f2937';
  tip.style.color = '#f9fafb';
  tip.style.padding = '8px 12px';
  tip.style.borderRadius = '6px';
  tip.style.fontSize = '12px';
  tip.style.fontFamily = 'Arial, sans-serif';
  tip.style.lineHeight = '1.5';
  tip.style.whiteSpace = 'nowrap';
  tip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';

  var locHtml = buildLocationTooltip(locations);
  if (!locHtml) {
    btn.style.opacity = '0.4';
    btn.style.cursor = 'default';
  }
  tip.innerHTML = locHtml || '<div>No location data available</div>';

  btn.addEventListener('mouseenter', function () {
    tip.style.display = 'block';
    var btnRect = btn.getBoundingClientRect();
    var tipWidth = tip.offsetWidth || 260;
    var left = btnRect.left + btnRect.width / 2 - tipWidth / 2;
    if (left < 8) left = 8;
    if (left + tipWidth > window.innerWidth - 8) left = window.innerWidth - tipWidth - 8;
    tip.style.left = left + 'px';
    tip.style.top = (btnRect.bottom + 6) + 'px';
  });
  btn.addEventListener('mouseleave', function () {
    tip.style.display = 'none';
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(tip);
  return wrapper;
}

function addScoreBadge(card, serverResult) {
  var existing = card.querySelector('.house-scorer-score');
  if (existing) existing.remove();
  var existingTip = card.querySelector('.house-scorer-tooltip');
  if (existingTip) existingTip.remove();
  var existingContainer = card.querySelector('.house-scorer-badge-container');
  if (existingContainer) existingContainer.remove();

  var score = serverResult.score;

  var badge = document.createElement('div');
  badge.className = 'house-scorer-score';
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
  if (expl.supermarket) explLines += '<div>' + expl.supermarket + '</div>';
  if (expl.transit) explLines += '<div>' + expl.transit + '</div>';
  if (expl.commuteWork) explLines += '<div>' + expl.commuteWork + '</div>';
  if (expl.commuteWifeWork) explLines += '<div>' + expl.commuteWifeWork + '</div>';

  tooltip.innerHTML =
    '<div style="margin-bottom:4px;"><b>Score: ' + score + '</b></div>' + explLines;

  badge.addEventListener('mouseenter', function () {
    tooltip.style.display = 'block';
  });
  badge.addEventListener('mouseleave', function () {
    tooltip.style.display = 'none';
  });

  card.style.position = 'relative';

  var locBtn = buildLocationButton(serverResult.locationInfo);

  var isVisited = serverResult.visited === true;
  var visitedBtn = document.createElement('button');
  visitedBtn.style.background = isVisited ? '#16a34a' : '#4b5563';
  visitedBtn.style.color = '#fff';
  visitedBtn.style.border = 'none';
  visitedBtn.style.borderRadius = '4px';
  visitedBtn.style.padding = '2px 6px';
  visitedBtn.style.fontSize = '10px';
  visitedBtn.style.cursor = 'pointer';
  visitedBtn.style.lineHeight = '14px';
  visitedBtn.textContent = isVisited ? '\u2713' : '\u25CB';

  (function () {
    var myVisited = isVisited;
    var myId = serverResult.id;
    visitedBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      fetch(SCORE_SERVER + '/expose-score/' + myId + '/visited', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visited: !myVisited })
      })
      .then(function (res) {
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then(function (data) {
        myVisited = data.visited;
        visitedBtn.style.background = myVisited ? '#16a34a' : '#4b5563';
        visitedBtn.textContent = myVisited ? '\u2713' : '\u25CB';
      })
      .catch(function () {});
    });
  })();

  var badgeContainer = document.createElement('div');
  badgeContainer.className = 'house-scorer-badge-container';
  badgeContainer.style.position = 'absolute';
  badgeContainer.style.top = '8px';
  badgeContainer.style.left = '8px';
  badgeContainer.style.zIndex = '11';
  badgeContainer.style.display = 'flex';
  badgeContainer.style.alignItems = 'center';
  badgeContainer.style.gap = '6px';
  badgeContainer.appendChild(badge);
  badgeContainer.appendChild(locBtn);
  badgeContainer.appendChild(visitedBtn);

  card.appendChild(badgeContainer);
  card.appendChild(tooltip);
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

  var heyImmoEl = document.querySelector('script[data-heyimmo-context="general"]');
  if (heyImmoEl) {
    try {
      var hi = JSON.parse(heyImmoEl.textContent);
      if (hi.addressAndLocation) {
        var al = hi.addressAndLocation;
        if (!data.address && al.street) {
          data.address = al.street + ' ' + al.houseNumber + ', ' + al.postcode + ' ' + al.city;
        }
        if (data.latitude == null && typeof al.latitude === 'number') data.latitude = al.latitude;
        if (data.longitude == null && typeof al.longitude === 'number') data.longitude = al.longitude;
      }
    } catch (e) {}
  }

  if (!data.address) {
    var addressJson = document.querySelector('script[type="application/ld+json"]');
    if (addressJson) {
      try {
        var ld = JSON.parse(addressJson.textContent);
        var graph = ld && ld['@graph'];
        if (graph) {
          for (var i = 0; i < graph.length; i++) {
            var addr = graph[i] && graph[i].address;
            if (addr && addr.streetAddress) {
              data.address = addr.streetAddress + ', ' + addr.postalCode + ' ' + addr.addressLocality;
              break;
            }
          }
        }
      } catch (e) {}
    }
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
  var postData = {
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
  };

  return fetchCachedOrCompute(data.exposeId, function () {
    return fetch(SCORE_SERVER + '/expose-score/' + data.exposeId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postData)
    }).then(function (res) {
      if (!res.ok) throw new Error('Server error: ' + res.status);
      return res.json();
    });
  });
}

function addExposeScoreOverlay(result) {
  var existing = document.querySelector('.house-scorer-expose-overlay');
  if (existing) existing.remove();

  var score = result.score;
  var scoreColor = score > 0 ? '#2563eb' : '#9ca3af';
  var isVisited = result.visited === true;
  var exposeId = result.id;

  var expl = result.explanation || {};
  var explLines = '';
  if (expl.location) explLines += '<div>' + expl.location + '</div>';
  if (expl.energy) explLines += '<div>' + expl.energy + '</div>';
  if (expl.rooms) explLines += '<div>' + expl.rooms + '</div>';
  if (expl.accessibility) explLines += '<div>' + expl.accessibility + '</div>';
  if (expl.construction) explLines += '<div>' + expl.construction + '</div>';
  if (expl.heatingType) explLines += '<div>' + expl.heatingType + '</div>';
  if (expl.maintenanceFee) explLines += '<div>' + expl.maintenanceFee + '</div>';
  if (expl.supermarket) explLines += '<div>' + expl.supermarket + '</div>';
  if (expl.transit) explLines += '<div>' + expl.transit + '</div>';
  if (expl.commuteWork) explLines += '<div>' + expl.commuteWork + '</div>';
  if (expl.commuteWifeWork) explLines += '<div>' + expl.commuteWifeWork + '</div>';

  var locHtml = buildLocationTooltip(result.locationInfo);
  var locSection = '';
  if (locHtml) {
    locSection = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.15);font-size:12px;">' +
      '<div style="margin-bottom:4px;">\uD83D\uDCCD <b>Location</b></div>' + locHtml + '</div>';
  }

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
  overlay.style.maxWidth = '340px';

  var visitedBtnId = 'hs-visited-btn-' + exposeId;
  overlay.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
      '<span style="background:' + scoreColor + ';color:#fff;border-radius:14px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;">' + score + '</span>' +
      '<b style="font-size:14px;">House Score</b>' +
      '<button id="' + visitedBtnId + '" style="margin-left:auto;background:' + (isVisited ? '#16a34a' : '#4b5563') + ';color:#fff;border:none;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;">' + (isVisited ? '\u2713 Visited' : 'Mark visited') + '</button>' +
    '</div>' + explLines + locSection;

  document.body.appendChild(overlay);

  var visitedBtn = document.getElementById(visitedBtnId);
  if (visitedBtn) {
    visitedBtn.addEventListener('click', function () {
      var newVisited = !isVisited;
      fetch(SCORE_SERVER + '/expose-score/' + exposeId + '/visited', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visited: newVisited })
      })
      .then(function (res) {
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then(function (data) {
        isVisited = data.visited;
        visitedBtn.style.background = isVisited ? '#16a34a' : '#4b5563';
        visitedBtn.textContent = isVisited ? '\u2713 Visited' : 'Mark visited';
      })
      .catch(function () {});
    });
  }

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
        locations: result.locationInfo,
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
    return scoreAndMarkAll();
  });
}

if (isExposePage()) {
  autoScoreExpose();
} else {
  sortAndMark();
  var pollCount = 0;
  var pollInterval = setInterval(function () {
    pollCount++;
    sortAndMark();
    if (pollCount >= 10) {
      clearInterval(pollInterval);
    }
  }, 30000);
}

window.houseScorer = { extractListings: extractListings, sortAndMark: sortAndMark, extractExposeData: extractExposeData, isExposePage: isExposePage };

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type === 'resortAndMark') {
    sortAndMark().then(function () {
      sendResponse({ done: true });
    });
    return true;
  }
});
