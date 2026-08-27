(function () {
  'use strict';

  var DATABASE_URL = 'https://varda-tv-default-rtdb.asia-southeast1.firebasedatabase.app';
  var stage = document.getElementById('stage');
  var status = document.getElementById('status');
  var currentSignature = '';
  var pollTimer = null;

  function trimText(value) {
    return String(value || '').replace(/^\s+|\s+$/g, '');
  }

  function screenId() {
    var hash = location.hash || '';
    var search = location.search || '';
    var match;

    match = search.match(/[?&]id=([^&]+)/i);
    if (match && match[1]) {
      try { return trimText(decodeURIComponent(match[1])).toLowerCase(); }
      catch (e) { return trimText(match[1]).toLowerCase(); }
    }

    if (hash.length > 1) return trimText(hash.substring(1)).toLowerCase();

    var parts = location.pathname.split('/');
    var clean = [];
    var i;
    for (i = 0; i < parts.length; i++) if (parts[i]) clean.push(parts[i]);
    if (clean.length) {
      var last = clean[clean.length - 1].replace(/\.html$/i, '').toLowerCase();
      if (last !== 'index' && last !== 'tv' && last !== '404' && last !== 'vtv') return last;
    }
    return '';
  }

  function setStatus(text, kind) {
    status.innerHTML = text;
    status.className = kind || '';
  }

  function kindFrom(url, forced) {
    if (forced && forced !== 'auto') return forced;
    var clean = String(url || '').split('?')[0].toLowerCase();
    if (/\.(png|jpg|jpeg|gif|svg|webp)$/.test(clean)) return 'image';
    if (/\.(mp4|webm|ogg)$/.test(clean)) return 'video';
    return 'web';
  }

  function fitClass(fit) {
    fit = fit || 'contain';
    if (fit !== 'cover' && fit !== 'fill') fit = 'contain';
    return 'fit-' + fit;
  }

  function signature(data) {
    try { return JSON.stringify(data || {}); }
    catch (e) { return String(new Date().getTime()); }
  }

  function render(data) {
    if (!data || data.active === false || (!data.imageData && !data.url)) {
      stage.innerHTML = '';
      currentSignature = '';
      setStatus('This TV screen is not assigned yet.', 'error');
      return;
    }

    var sig = signature(data);
    if (sig === currentSignature) return;
    currentSignature = sig;
    stage.innerHTML = '';

    var el;
    var type;

    if (data.imageData) {
      el = document.createElement('img');
      el.src = data.imageData;
      el.className = fitClass(data.fit);
    } else {
      type = kindFrom(data.url, data.type);
      if (type === 'image') {
        el = document.createElement('img');
        el.src = data.url;
        el.className = fitClass(data.fit);
      } else if (type === 'video') {
        el = document.createElement('video');
        el.src = data.url;
        el.autoplay = true;
        el.loop = true;
        el.muted = true;
        el.setAttribute('autoplay', 'autoplay');
        el.setAttribute('loop', 'loop');
        el.setAttribute('muted', 'muted');
        el.setAttribute('playsinline', 'playsinline');
        el.className = fitClass(data.fit);
        try { el.play(); } catch (e) {}
      } else {
        el = document.createElement('iframe');
        el.src = data.url;
        el.setAttribute('allow', 'autoplay; fullscreen');
      }
    }

    stage.appendChild(el);
    setStatus('LIVE - ' + (data.name || 'TV'), 'ok');

    try {
      localStorage.setItem('varda-tv-cache', JSON.stringify({ id: screenId(), data: data }));
    } catch (e) {}
  }

  function loadCache(id) {
    try {
      var cached = localStorage.getItem('varda-tv-cache');
      if (!cached) return;
      var c = JSON.parse(cached);
      if (c && c.id === id && c.data) render(c.data);
    } catch (e) {}
  }

  function fetchScreen(id) {
    var xhr = new XMLHttpRequest();
    var url = DATABASE_URL + '/screens/' + encodeURIComponent(id) + '.json?_=' + new Date().getTime();
    xhr.open('GET', url, true);
    xhr.timeout = 15000;

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          render(JSON.parse(xhr.responseText));
        } catch (e) {
          setStatus('TV data error. Retrying...', 'error');
        }
      } else if (xhr.status !== 0) {
        setStatus('Connection error. Retrying...', 'error');
      }
    };

    xhr.onerror = function () { setStatus('Connection error. Retrying...', 'error'); };
    xhr.ontimeout = function () { setStatus('Connection timeout. Retrying...', 'error'); };

    try { xhr.send(null); }
    catch (e) { setStatus('Connection error. Retrying...', 'error'); }
  }

  function start() {
    var id = screenId();
    if (!id) {
      setStatus('No screen ID. Use #1, ?id=1, or /1', 'error');
      return;
    }

    setStatus('Connecting to screen ' + id + '...');
    loadCache(id);
    fetchScreen(id);
    pollTimer = setInterval(function () { fetchScreen(id); }, 10000);
  }

  start();
}());
