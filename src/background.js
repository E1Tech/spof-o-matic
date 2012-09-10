var active = false;
var blockHosts = new Array();
var whiteList = new Array();
var detected_spof = {};
var blocked = {};
var badges = {};
var tab_icons = {};
var tab_text = {};
var page_tlds = {};

// known 3rd-party assets
var blockList = [
  'platform\.twitter\.com',
  'connect\.facebook\.net',
  'platform\.linkedin\.com',
  'assets\.pinterest\.com',
  'widgets\.digg\.com',
  '.*\.addthis\.com',
  'ajax\.googleapis\.com',
  'code\.jquery\.com',
  'cdn\.jquerytools\.org',
  'apis\.google\.com',
  '.*\.google-analytics\.com',
  '.*\.chartbeat\.com',
  'static\.chartbeat\.com',
  '.*\.2o7\.net',
  '.*\.revsci\.net',
  '.*\.omtrdc\.net',
  'b\.scorecardresearch\.com',
  'cdn\.sailthru\.com',
  '.*browserid\.org',
  'ad\.doubleclick\.net',
  'js\.adsonar\.com',
  'ycharts\.com',
  '.*\.googlecode\.com',
  '.*\.gstatic\.com',
  '.*\.quantserve\.com',
  '.*\.brightcove\.com'
];

var ICON_ACTIVE = "active.png";
var ICON_INACTIVE = "inactive.png";
var ICON_BLOCKED = "blocked.png";
var ICON_DETECTED = "detected.png";
var ICON_DEFAULT = ICON_INACTIVE;

var tldRegex = /[-\w]+\.(?:[-\w]+\.xn--[-\w]+|[-\w]{3,}|[-\w]+\.[-\w]{2})$/i;
var hostRegex = /[^\/]*\/\/([^\/]+)/;

// Array Remove - By John Resig (MIT Licensed)
Array.prototype.remove = function(from, to) {
  var rest = this.slice((to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};

chrome.webRequest.onBeforeRequest.addListener(
  function(info) {
    var action = {};
    if (info.type == 'main_frame') {
      detected_spof[info.tabId] = {};
      blocked[info.tabId] = {};
      delete detected_spof[info.tabId];
      delete blocked[info.tabId];
      SetBadge(info.tabId, ICON_DEFAULT);
      // update the TLD list for the current page
      page_tlds[info.tabId] = new Array();
      page_tlds[info.tabId].push(info.url.match(hostRegex)[1].toString().match(tldRegex).toString());
    }
    if (active && info.type == 'script' && BlockURL(info.url, info.tabId)) {
      Blocked(info.url, info.tabId);
      SetBadge(info.tabId, ICON_BLOCKED)
      console.log("blocking: " + info.url);
      action.redirectUrl = 'https://blackhole.webpagetest.org/';
    }
    return action;
  },
  // filters
  {
    urls: [
      "http://*/*",
      "https://*/*",
    ]
  },
  // extraInfoSpec
  ["blocking"]
);

chrome.webRequest.onCompleted.addListener(
  function(info) {
    if (info.method == 'GET' && info.statusCode == 200) {
      // make sure it was a text resource (html preferred) and not a file download
      var ok = true;
      if (info['responseHeaders'] != undefined) {
        for (i = 0; i < info.responseHeaders.length && ok; i++) {
          var name = info.responseHeaders[i].name.toLowerCase();
          var value = info.responseHeaders[i].value.toLowerCase();
          if (name == 'content-type') {
            if (value.indexOf('text') < 0) {
              ok = false;
            }
          } else if (name == 'content-disposition') {
            ok = false;
          }
        }
      }
      if (ok) {
        try {
          var xhr = new XMLHttpRequest();
          console.log('Fetching ' + info.url);
          xhr.open('GET', info.url, true);
          xhr.onreadystatechange = function() {
            if (xhr.readyState != 4)
              return;
            if (xhr.status == 200) {
              spofCheck(info.tabId, info.url, xhr.responseText);
              xhr.responseText = null;
            }
            xhr.onreadystatechange = null;
            xhr.abort();
          };
          xhr.send();
        } catch (err) {}
      }
    }
    return {};
  },
  // filters
  {
    urls: [
      "http://*/*",
      "https://*/*",
    ],
    types: ['main_frame']
  },
  // extraInfoSpec
  ["responseHeaders"]
);

/*
  See if we need to block the given URL
*/
function BlockURL(url, tabid) {
  var block = false;
  // get the host name
  var host = url.match(hostRegex)[1].toString();
  if (!isOnWhiteList(host, tabid)) {
    block = IsOnBlockList(host);
    for (i = 0; i < blockHosts.length && !block; i++) {
      if (blockHosts[i] == host) {
        block = true;
      }
    }
  }

  if (block) {
    console.log("blocking: " + url);
  }
  return block;
}

/*
  The given URL was blocked, keep track of it
*/
function Blocked(url, tabId) {
  var host = url.match(hostRegex)[1].toString();
  if (blocked[tabId] == undefined) {
    blocked[tabId] = {};
  }
  if (blocked[tabId][host] == undefined) {
    blocked[tabId][host] = new Array();
  }
  var exists = false;
  for (i=0; i < blocked[tabId][host].length && !exists; i++) {
    if (blocked[tabId][host][i] == url) {
      exists = true;
    }
  }
  if (!exists) {
    blocked[tabId][host].push(url);
  }
}

function IsOnBlockList(host) {
  var found = false;
  for (i = 0; i < blockList.length && !found; i++) {
    var blockRegex = new RegExp(blockList[i], 'im');
    if (blockRegex.test(host)) {
      found = true;
    }
  }
  return found;
}

function UpdateBlockList() {
  console.log('Default block list:');
  console.log(blockList);
  var blockHostsStr = localStorage['hosts'];
  if (blockHostsStr && blockHostsStr.length) {
    blockHosts = JSON.parse(blockHostsStr);
    console.log('Local block list:');
    console.log(blockHosts);
  }
  var whiteListStr = localStorage['whitelist'];
  if (whiteListStr && whiteListStr.length) {
    whiteList = JSON.parse(whiteListStr);
    console.log('White List:');
    console.log(whiteList);
  }
}

UpdateBlockList();

function SetBadge(tab_id, popupIcon, badgeText) {
  var popupUrl = "popup.html?tab=" + tab_id;
  chrome.browserAction.setPopup({tabId: tab_id, popup: popupUrl});
  chrome.browserAction.setIcon({tabId: tab_id, path: popupIcon});
  if (badgeText && badgeText.length) {
    chrome.browserAction.setBadgeText({tabId: tab_id, text: badgeText});
  }
  tab_icons[tab_id] = popupIcon;
  tab_text[tab_id] = badgeText;
}

function RefreshBadge(tab_id) {
  if (tab_icons[tab_id] != undefined) {
    SetBadge(tab_id, tab_icons[tab_id], tab_text[tab_id]);
  }
}

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  // refresh the badge every time the tab state changes, otherwise Chrome tends to revert to the default
  RefreshBadge(tabId);
});

/*********************************************************************************
**********************************************************************************
**
**  Communication with the pop-up
**
**********************************************************************************
**********************************************************************************/
function onRequest(request, sender, sendResponse) {
  if (request.msg == 'getSPOF') {
    var response = {isActive: active};
    if (request['tab'] && detected_spof[request['tab']] != undefined) {
      response['spof'] = detected_spof[request['tab']];
      if (response['spof']['scripts'] != undefined) {
        for( var i = 0; i < response['spof']['scripts'].length; i++) {
          if (response['spof']['scripts'][i]['host'] != undefined) {
            response['spof']['scripts'][i]['whitelist'] = isOnWhiteList(response['spof']['scripts'][i]['host'], null);
          }
        }
      }
    }
    if (active && request['tab'] && blocked[request['tab']] != undefined) {
      response['blocked'] = blocked[request['tab']];
      for (host in response['blocked']) {
        if (isOnWhiteList(host, null)) {
          delete response['blocked'][host];
        }
      }
    }
    sendResponse(response);
  } else if (request.msg == 'getLists') {
    var response = {isActive: active};
    response['whitelist'] = whiteList;
    response['block'] = blockHosts;
    sendResponse(response);
  } else if (request.msg == 'enable') {
    active = true;
    ICON_DEFAULT = ICON_ACTIVE;
    chrome.browserAction.setIcon({path: ICON_DEFAULT});
    sendResponse({});
  } else if (request.msg == 'disable') {
    active = false;
    ICON_DEFAULT = ICON_INACTIVE;
    chrome.browserAction.setIcon({path: ICON_DEFAULT});
    sendResponse({});
  } else if (request.msg == 'reset') {
    blockHosts = new Array();
    localStorage['hosts'] = JSON.stringify(blockHosts);
    whiteList = new Array();
    localStorage['whitelist'] = JSON.stringify(whiteList);
    UpdateBlockList();
  } else if (request.msg == 'wl_add' && request['host'] != undefined) {
    addToWhiteList(request['host']);
  } else if (request.msg == 'wl_remove' && request['host'] != undefined) {
    removeFromWhiteList(request['host']);
  }
};
chrome.extension.onRequest.addListener(onRequest);

/*********************************************************************************
**********************************************************************************
**
**  White list management
**
**********************************************************************************
**********************************************************************************/
function isOnWhiteList(host, tabid) {
  var found = false;
  // check the explicit white list
  for (i = 0; i < whiteList.length && !found; i++) {
    if (whiteList[i] == host) {
      found = true;
    }
  }
  // see if it matches a tld on the current page
  if (tabid && !found && page_tlds[tabid] !== undefined) {
    var tld = host.match(tldRegex).toString();
    for (i = 0; i < page_tlds[tabid].length && !found; i++) {
      if (page_tlds[tabid][i] == tld) {
        found = true;
      }
    }
  }
  return found;
}

function addToWhiteList(host) {
  if (!isOnWhiteList(host, null)) {
    whiteList.push(host);
    localStorage['whitelist'] = JSON.stringify(whiteList);
  }
}

function removeFromWhiteList(host) {
  var found = false;
  for (i = 0; i < whiteList.length && !found; i++) {
    if (whiteList[i] == host) {
      whiteList.remove(i);
      localStorage['whitelist'] = JSON.stringify(whiteList);
      found = true;
    }
  }
}

/*********************************************************************************
**********************************************************************************
**
**  SPOF Detection logic
**
**********************************************************************************
**********************************************************************************/
function setSPOF(tab_id, spofHosts, spofScripts) {
  // make sure we have hosts that aren't on the white list
  var hostCount = 0;
  for (var i = 0; i < spofHosts.length; i++) {
    if (!isOnWhiteList(spofHosts[i], null)) {
      hostCount++;
    }
  }
  // count the scripts that block >= 40% of the content
  warnCount = 0;
  for (var i = 0; i < spofScripts.length; i++) {
    if (spofScripts[i]['scripts'] !== undefined) {
      for (j = 0; j < spofScripts[i]['scripts'].length; j++) {
        if (spofScripts[i]['scripts'][j]['blockedContent'] !== undefined) {
          if (spofScripts[i]['scripts'][j]['blockedContent'] >= 40) {
            warnCount++;
          }
        }
      }
    }
  }
  if (warnCount > 0 && hostCount > 0 && (!active || blocked[tab_id] == undefined)) {
    SetBadge(tab_id, ICON_DETECTED, warnCount.toString());
  }
  detected_spof[tab_id] = {hosts: spofHosts, scripts: spofScripts};
  // add the hosts if we don't already know about them
  var modified = false;
  for (var i = 0; i < spofHosts.length; i++) {
    var found = false;
    for( var j = 0; j < blockHosts.length && !found; j++) {
      if (blockHosts[j].toString() == spofHosts[i]) {
        found = true;
      }
    }
    if (!found) {
      blockHosts.push(spofHosts[i]);
      modified = true;
    }
  }
  if (modified) {
    localStorage['hosts'] = JSON.stringify(blockHosts);
  }
}

function spofMatch(arr, str) {
  var found = false;
  for( var i = 0; i < arr.length && !found; i++) {
    if (arr[i].toString() == str) {
      found = true;
    }
  }
  return found;
}

function spofAddArrayElement(arr, str) {
  if (!spofMatch(arr,str)) {
    arr.push(str);
  }
}

function spofAddScript(arr, host, script, blockedContent) {
  var found = false;
  for( var i = 0; i < arr.length && !found; i++) {
    if (arr[i]['host'].toString() == host) {
      arr[i]['scripts'].push({'script':script, 'blockedContent':blockedContent});
      found = true;
    }
  }
  if (!found) {
    arr.push({'host':host, 'scripts':[{'script':script, 'blockedContent':blockedContent}]});
  }
}

function spofCheck(tab_id, url, pageText) {
  // build a list of "safe" host names (anything where css or images were served)
  var cssRegex = /<link [^>]*href[ =htps:"']+\/\/([^\/ "]+)\/[^>]+>/gi;
  var cssValidRegex = /<link [^>]*rel[ ='"]+stylesheet/gi;
  var imgRegex = /<img [^>]*src[ =htps:"']+\/\/([^\/ "]+)\/[^>]+>/gi;
  var scriptRegex = /<script [^>]*src[ =htps:"']+\/\/([^\/ "]+)\/[^>]+>/gi;
  var spofRegex = /<(script|link) [^>]*(src|href)[ =htps:"']+\/\/([^\/ "]+)\/[^>]+>/gi;
  var htmlUrlRegex = /(href|src)[ =htps:"']+\/\/([^'"> "]+)\//i;
  var htmlHostRegex = /(href|src)[ =htps:"']+\/\/([^\/ "]+)\//i;
  var asyncRegex = /async[ ]*=/i;
  var safeTLDs = new Array();
  var thirdParty = new Array();
  var spofHosts = new Array();
  var spofScripts = new Array();

  safeTLDs.push(url.match(hostRegex)[1].toString().match(tldRegex).toString());
  var matches = pageText.match(cssRegex);
  if (matches) {
    for (var i = 0; i < matches.length; i++) {
      try {
        // do not count css files that have "font" in the name as being safe
        var url = matches[i].toString().match(htmlUrlRegex)[2].toString();
        if (!url.match(/font/i)) {
          spofAddArrayElement(safeTLDs, matches[i].toString().match(htmlHostRegex)[2].toString().match(tldRegex).toString());
        }
      } catch(err) {}
    }
  }
  matches = pageText.match(imgRegex);
  if (matches) {
    for (var i = 0; i < matches.length; i++) {
      try {
        spofAddArrayElement(safeTLDs, matches[i].toString().match(htmlHostRegex)[2].toString().match(tldRegex).toString());
      } catch(err) {}
    }
  }
  console.log("Safe TLD's: " + safeTLDs);
  var pageLen = pageText.length;
  while ((match = spofRegex.exec(pageText)) != null) {
    try {
      var script = match[0].toString();
      var blockedContent = 100 - (((match.index + script.length) / pageLen) * 100);
      var host = script.match(htmlHostRegex)[2].toString();
      var tld = host.match(tldRegex).toString();
      if (!script.match(cssRegex) || script.match(cssValidRegex)) {
        if (IsOnBlockList(host) || !spofMatch(safeTLDs, tld)) {
          spofAddArrayElement(thirdParty, host);
          if (!asyncRegex.test(script)) {
            spofAddArrayElement(spofHosts, host);
            spofAddScript(spofScripts, host, script, blockedContent);
            console.log('SPOF (' + blockedContent.toFixed(2) + '%): ' + script);
          }
        }
      }
    } catch(err) {}
  }
  console.log("SPOF Hosts: " + spofHosts);
  if (spofHosts.length) {
    setSPOF(tab_id, spofHosts, spofScripts);
  }
}

