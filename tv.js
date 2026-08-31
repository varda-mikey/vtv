(function () {
  'use strict';

  var DATABASE_URL = 'https://varda-tv-default-rtdb.asia-southeast1.firebasedatabase.app';
  var stage = document.getElementById('stage');
  var status = document.getElementById('status');
  var currentSignature = '';
  var pollTimer = null;
  var slideTimer = null;
  var slideIndex = 0;
  var currentData = null;
  var currentVideo = null;

  function trimText(value) { return String(value || '').replace(/^\s+|\s+$/g, ''); }

  function screenId() {
    var hash = location.hash || '';
    var search = location.search || '';
    var match = search.match(/[?&]id=([^&]+)/i);
    if (match && match[1]) {
      try { return trimText(decodeURIComponent(match[1])).toLowerCase(); }
      catch (e) { return trimText(match[1]).toLowerCase(); }
    }
    if (hash.length > 1) return trimText(hash.substring(1)).toLowerCase();
    var parts = location.pathname.split('/'), clean = [], i;
    for (i = 0; i < parts.length; i++) if (parts[i]) clean.push(parts[i]);
    if (clean.length) {
      var last = clean[clean.length - 1].replace(/\.html$/i, '').toLowerCase();
      if (last !== 'index' && last !== 'tv' && last !== '404' && last !== 'vtv') return last;
    }
    return '';
  }

  function setStatus(text, kind) { status.innerHTML = text; status.className = kind || ''; }

  function fitClass(fit) {
    fit = fit || 'contain';
    if (fit !== 'cover' && fit !== 'fill') fit = 'contain';
    return 'fit-' + fit;
  }

  function getSlides(data) {
    var out = [], i, s;
    if (data && data.type === 'video' && data.videoData) {
      out.push({ mediaType: 'video', videoData: data.videoData, videoName: data.videoName || 'Video' });
      return out;
    }
    if (data && data.slides && typeof data.slides.length !== 'undefined') {
      for (i = 0; i < data.slides.length; i++) {
        s = data.slides[i];
        if (s && (s.imageData || s.videoData)) out.push(s);
      }
    }
    if (!out.length && data && data.videoData) {
      out.push({ mediaType: 'video', videoData: data.videoData, videoName: data.videoName || 'Video' });
    }
    if (!out.length && data && data.imageData) {
      out.push({ mediaType: 'image', imageData: data.imageData, imageName: data.imageName || 'Image', duration: data.slideSeconds || 10 });
    }
    return out;
  }

  function signature(data) {
    if (!data) return '';
    var first = getSlides(data)[0] || {};
    return String(data.updatedAt || '') + '|' + String(data.name || '') + '|' + String(data.slideSeconds || '') + '|' + String(data.type || '') + '|' + String(getSlides(data).length) + '|' + String(first.videoName || first.imageName || '');
  }

  function clearSlideTimer() {
    if (slideTimer) { clearTimeout(slideTimer); slideTimer = null; }
  }

  function clearVideo() {
    if (currentVideo) {
      try { currentVideo.pause(); currentVideo.removeAttribute('src'); currentVideo.load(); } catch (e) {}
      currentVideo = null;
    }
  }

  function showSlide(index) {
    if (!currentData) return;
    var slides = getSlides(currentData);
    if (!slides.length) return;
    if (index >= slides.length) index = 0;
    slideIndex = index;
    var slide = slides[index];
    stage.innerHTML = '';
    clearVideo();

    if (slide.videoData) {
      var video = document.createElement('video');
      video.src = slide.videoData;
      video.className = fitClass(currentData.fit);
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.controls = true;
      video.preload = 'auto';
      video.setAttribute('aria-label', slide.videoName || 'VARDA TV video');
      stage.appendChild(video);
      currentVideo = video;
      setStatus('LIVE - ' + (currentData.name || 'TV') + ' • VIDEO', 'ok');
      var playAttempt = video.play();
      if (playAttempt && typeof playAttempt.catch === 'function') playAttempt.catch(function () {
        setStatus('LIVE - ' + (currentData.name || 'TV') + ' • VIDEO • Press Play', 'ok');
      });
      return;
    }

    var img = document.createElement('img');
    img.src = slide.imageData;
    img.className = fitClass(currentData.fit);
    img.alt = slide.imageName || 'VARDA TV display';
    stage.appendChild(img);
    setStatus('LIVE - ' + (currentData.name || 'TV'), 'ok');
    clearSlideTimer();
    if (slides.length > 1) {
      var sec = parseInt(slide.duration || currentData.slideSeconds || 10, 10);
      if (!sec || sec < 2) sec = 2;
      if (sec > 120) sec = 120;
      slideTimer = setTimeout(function () { showSlide(slideIndex + 1); }, sec * 1000);
    }
  }

  function render(data) {
    var slides = getSlides(data);
    if (!data || data.active === false || !slides.length) {
      stage.innerHTML = '';
      currentSignature = '';
      currentData = null;
      clearSlideTimer();
      clearVideo();
      setStatus('This TV screen is not assigned yet.', 'error');
      return;
    }
    var sig = signature(data);
    if (sig === currentSignature) return;
    currentSignature = sig;
    currentData = data;
    slideIndex = 0;
    showSlide(0);
    try { localStorage.setItem('varda-tv-cache', JSON.stringify({ id: screenId(), data: data })); } catch (e) {}
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
        try { render(JSON.parse(xhr.responseText)); }
        catch (e) { setStatus('TV data error. Retrying...', 'error'); }
      } else if (xhr.status !== 0) setStatus('Connection error. Retrying...', 'error');
    };
    xhr.onerror = function () { setStatus('Connection error. Retrying...', 'error'); };
    xhr.ontimeout = function () { setStatus('Connection timeout. Retrying...', 'error'); };
    try { xhr.send(null); } catch (e) { setStatus('Connection error. Retrying...', 'error'); }
  }

  function start() {
    var id = screenId();
    if (!id) { setStatus('No screen ID. Use #1, ?id=1, or /1', 'error'); return; }
    setStatus('Connecting to screen ' + id + '...');
    loadCache(id);
    fetchScreen(id);
    pollTimer = setInterval(function () { fetchScreen(id); }, 10000);
  }

  start();
}());
