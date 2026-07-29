/* ===== Firebase Config (cross-device message board) ===== */
const firebaseConfig = {
  apiKey: "AIzaSyBp1GZu2WHJN0KbS6z0quxr-hIT_6QVPWU",
  authDomain: "eamon-website.firebaseapp.com",
  databaseURL: "https://eamon-website-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "eamon-website",
  storageBucket: "eamon-website.firebasestorage.app",
  messagingSenderId: "238670882890",
  appId: "1:238670882890:web:e86eed464859cf6ca15eb3"
};
let db = null;
let useFirebase = false;

/* Load Firebase SDK asynchronously — non-blocking with 8s timeout fallback */
var _firebaseLoaded = false;
function loadFirebaseAsync() {
  /* 8秒超时：如果 Firebase SDK 没加载成功，降级到 localStorage */
  var fbTimeout = setTimeout(function() {
    if (!_firebaseLoaded) {
      console.warn('Firebase SDK load timeout (8s), falling back to localStorage');
      useFirebase = false;
      /* 确保 localStorage 数据已加载 */
      if (typeof loadNotes === 'function') loadNotes();
      if (typeof loadThoughts === 'function') loadThoughts();
      if (typeof loadFoodReviews === 'function') loadFoodReviews();
      if (typeof initVisitorCounter === 'function') initVisitorCounter();
    }
  }, 8000);

  var s1 = document.createElement('script');
  s1.src = 'https://cdn.bootcdn.net/ajax/libs/firebase/10.12.0/firebase-app-compat.min.js';
  s1.onload = function() {
    var s2 = document.createElement('script');
    s2.src = 'https://cdn.bootcdn.net/ajax/libs/firebase/10.12.0/firebase-database-compat.min.js';
    s2.onload = function() {
      try {
        if (typeof firebase !== 'undefined' && firebaseConfig.databaseURL) {
          firebase.initializeApp(firebaseConfig);
          db = firebase.database();
          useFirebase = true;
          _firebaseLoaded = true;
          clearTimeout(fbTimeout);
          initFirebaseListeners();
        }
      } catch(e) { console.warn('Firebase init skipped:', e.message); }
    };
    s2.onerror = function() { console.warn('Firebase database SDK failed to load'); };
    document.head.appendChild(s2);
  };
  s1.onerror = function() { console.warn('Firebase app SDK failed to load'); };
  document.head.appendChild(s1);
}

/* Deferred Firebase init — runs after page is fully interactive */
if (document.readyState === 'complete') {
  loadFirebaseAsync();
} else {
  window.addEventListener('load', loadFirebaseAsync);
}

/* ===== Visitor Tracking ===== */
function trackVisitor() {
  if (!useFirebase) return;
  var fingerprint = localStorage.getItem('eamon_visitor_id');
  var isNewVisitor = !fingerprint;
  if (!fingerprint) {
    fingerprint = 'v' + Date.now() + Math.random().toString(36).substr(2, 6);
    localStorage.setItem('eamon_visitor_id', fingerprint);
  }
  var now = new Date();
  var dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  var timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  var referrer = document.referrer || '直接访问';
  var screen = window.screen.width + 'x' + window.screen.height;
  var visitorData = {
    id: fingerprint,
    date: dateStr,
    time: timeStr,
    ts: Date.now(),
    referrer: referrer,
    screen: screen,
    ua: navigator.userAgent.substring(0, 100)
  };
  db.ref('visitors/' + fingerprint).set(visitorData);
  db.ref('visitor_stats/total').transaction(function(current) { return (current || 0) + 1; });
  if (isNewVisitor) {
    db.ref('visitor_stats/unique').transaction(function(current) { return (current || 0) + 1; });
  }
  db.ref('visitor_stats/daily/' + dateStr).transaction(function(current) { return (current || 0) + 1; });
}

/* Display visitor count in footer */
function initVisitorCounter() {
  if (!useFirebase) return;
  db.ref('visitor_stats').on('value', function(snapshot) {
    var stats = snapshot.val() || {};
    var total = stats.total || 0;
    var unique = stats.unique || 0;
    var todayStr = new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0') + '-' + String(new Date().getDate()).padStart(2,'0');
    var today = (stats.daily && stats.daily[todayStr]) || 0;
    var counterEl = document.getElementById('visitorCounter');
    if (counterEl) {
      counterEl.innerHTML = '👁 今日 ' + today + ' · 累计 ' + total + ' 次访问';
    }
  });
}

/* ===== Food Review (探店红黑榜) ===== */
var FOOD_KEY = 'eamon_food_reviews';
var foodData = [];
var foodFilter = { cat: 'all', list: 'all', city: 'all' };
var foodFormState = { cat: '', subcat: '', list: '', stars: 0, photos: [], lat: 0, lng: 0 };

var CAT_NAMES = { bar: '酒吧', cafe: '咖啡馆', food: '餐饮', fun: '娱乐' };

function loadFoodReviews() {
  if (useFirebase) {
    /* Load from localStorage first for instant display */
    try {
      var cached = JSON.parse(localStorage.getItem(FOOD_KEY) || '[]');
      if (Array.isArray(cached) && cached.length > 0) {
        foodData = cached;
        renderFoodBoard();
        updateCityFilter();
      }
    } catch(e) {}

    /* value: load ALL reviews at once */
    db.ref('food_reviews').orderByChild('ts').on('value', function(snapshot) {
      var val = snapshot.val();
      if (val) {
        foodData = Object.keys(val).map(function(key) {
          var r = val[key];
          r.id = key;
          if (r.photos && !Array.isArray(r.photos)) r.photos = Object.values(r.photos);
          if (!r.photos) r.photos = [];
          return r;
        }).sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });
      } else {
        foodData = [];
      }
      try { localStorage.setItem(FOOD_KEY, JSON.stringify(foodData)); } catch(e) {}
      renderFoodBoard();
      updateCityFilter();
    });
    /* child_changed for real-time updates */
    db.ref('food_reviews').on('child_changed', function(snapshot) {
      var r = snapshot.val();
      r.id = snapshot.key;
      if (r.photos && !Array.isArray(r.photos)) r.photos = Object.values(r.photos);
      if (!r.photos) r.photos = [];
      var idx = foodData.findIndex(function(f) { return f.id === r.id; });
      if (idx >= 0) foodData[idx] = r;
      renderFoodBoard();
    });
  } else {
    try { foodData = JSON.parse(localStorage.getItem(FOOD_KEY) || '[]'); } catch(e) { foodData = []; }
    if (!Array.isArray(foodData)) foodData = [];
    renderFoodBoard();
    updateCityFilter();
  }
}

function updateCityFilter() {
  var select = document.getElementById('foodCityFilter');
  if (!select) return;
  var cities = ['all'];
  foodData.forEach(function(r) { if (r.city && cities.indexOf(r.city) === -1) cities.push(r.city); });
  var currentVal = select.value;
  select.innerHTML = '<option value="all">全部城市</option>' +
    cities.filter(function(c) { return c !== 'all'; }).map(function(c) {
      return '<option value="' + c + '"' + (c === currentVal ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
  foodFilter.city = currentVal || 'all';
}

function renderFoodBoard() {
  var board = document.getElementById('foodBoard');
  if (!board) return;

  var citySel = document.getElementById('foodCityFilter');
  if (citySel) foodFilter.city = citySel.value;

  var filtered = foodData.filter(function(r) {
    if (foodFilter.cat !== 'all' && r.cat !== foodFilter.cat) return false;
    if (foodFilter.list !== 'all' && r.list !== foodFilter.list) return false;
    if (foodFilter.city !== 'all' && r.city !== foodFilter.city) return false;
    return true;
  });

  /* Update stats and counts */
  updateFoodStats();

  if (filtered.length === 0) {
    board.innerHTML = '<div class="food-empty"><div class="food-empty-icon">🍽️</div>还没有探店评价，快来添加第一条吧！</div>';
    return;
  }

  board.innerHTML = filtered.map(function(r) {
    var stars = '';
    for (var i = 1; i <= 5; i++) {
      stars += i <= r.stars ? '★' : '<span class="dim">★</span>';
    }
    var photos = '';
    if (r.photos && r.photos.length > 0) {
      var photoCount = r.photos.length;
      var cls = photoCount > 1 ? 'multiple' : '';
      if (photoCount === 3) cls = 'multiple three';
      var showPhotos = r.photos.slice(0, 3);
      var moreLabel = photoCount > 3 ? '<div class="food-card-photo-more">+' + (photoCount - 3) + ' 张</div>' : '';
      photos = '<div class="food-card-photos ' + cls + '">' +
        showPhotos.map(function(p) { return '<img src="' + p + '" alt="" loading="lazy" />'; }).join('') +
        moreLabel +
        '</div>';
    } else {
      /* No-photo placeholder using category icon */
      var catIcon = { bar: '🍸', cafe: '☕', food: '🍽️', fun: '🎮' }[r.cat] || '📍';
      photos = '<div class="food-card-nophoto">' + catIcon + '</div>';
    }
    var addr = '';
    if (r.addr) {
      var mapLink = r.lat && r.lng
        ? 'https://uri.amap.com/marker?position=' + r.lng + ',' + r.lat + '&name=' + encodeURIComponent(r.name)
        : 'https://www.amap.com/search?query=' + encodeURIComponent(r.name + ' ' + r.addr);
      addr = '<div class="food-card-addr">' + escapeHtml(r.addr) +
        ' <a href="' + mapLink + '" target="_blank">地图 →</a></div>';
    }
    var subcatTag = r.subcat ? '<span class="food-card-subcat">' + escapeHtml(r.subcat) + '</span>' : '';
    var cityTag = r.city ? '<span class="food-card-city">' + escapeHtml(r.city) + '</span>' : '';
    var reviewShort = escapeHtml(r.review || '');
    var isLong = reviewShort.length > 100;

    return '<div class="food-card ' + r.list + '">' +
      '<span class="food-card-badge ' + r.list + '">' + (r.list === 'red' ? '红榜' : '黑榜') + '</span>' +
      photos +
      '<div class="food-card-body">' +
        '<div class="food-card-name">' + escapeHtml(r.name) + '</div>' +
        '<div class="food-card-meta">' +
          '<span class="food-card-cat">' + (CAT_NAMES[r.cat] || r.cat) + '</span>' +
          subcatTag + cityTag +
          '<span class="food-card-stars">' + stars + '</span>' +
        '</div>' +
        addr +
        '<div class="food-card-review" id="review-' + r.id + '">' + reviewShort + '</div>' +
        (isLong ? '<button class="food-card-expand" onclick="expandReview(\'' + r.id + '\')">展开全部</button>' : '') +
        '<div class="food-card-footer">' +
          '<span class="food-card-author">' + escapeHtml(r.author || '匿名访客') + '</span>' +
          '<span class="food-card-time">' + formatFoodTime(r.ts) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function updateFoodStats() {
  var total = foodData.length;
  var redCount = foodData.filter(function(r) { return r.list === 'red'; }).length;
  var blackCount = foodData.filter(function(r) { return r.list === 'black'; }).length;

  var statsEl = document.getElementById('foodStats');
  if (statsEl) {
    if (total === 0) {
      statsEl.innerHTML = '';
    } else {
      statsEl.innerHTML =
        '<div class="food-stat"><div class="food-stat-num total">' + total + '</div><div class="food-stat-label">探店总数</div></div>' +
        '<div class="food-stat"><div class="food-stat-num red">' + redCount + '</div><div class="food-stat-label">红榜推荐</div></div>' +
        '<div class="food-stat"><div class="food-stat-num black">' + blackCount + '</div><div class="food-stat-label">黑榜避雷</div></div>';
    }
  }

  var countAll = document.getElementById('countAll');
  var countRed = document.getElementById('countRed');
  var countBlack = document.getElementById('countBlack');
  if (countAll) countAll.textContent = total;
  if (countRed) countRed.textContent = redCount;
  if (countBlack) countBlack.textContent = blackCount;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatFoodTime(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function expandReview(id) {
  var el = document.getElementById('review-' + id);
  if (!el) return;
  el.classList.toggle('expanded');
  var btn = el.nextElementSibling;
  if (btn && btn.classList.contains('food-card-expand')) {
    btn.textContent = el.classList.contains('expanded') ? '收起' : '展开全部';
  }
}

/* Form toggle */
function toggleFoodForm() {
  var overlay = document.getElementById('foodFormOverlay');
  if (!overlay) return;
  overlay.classList.toggle('open');
  if (overlay.classList.contains('open')) {
    resetFoodForm();
  }
}

function resetFoodForm() {
  foodFormState = { cat: '', subcat: '', list: '', stars: 0, photos: [], lat: 0, lng: 0 };
  document.getElementById('foodName').value = '';
  document.getElementById('foodCity').value = '';
  document.getElementById('foodAddr').value = '';
  document.getElementById('foodReview').value = '';
  document.getElementById('foodAuthor').value = '';
  document.getElementById('foodCustomSubcat').value = '';
  document.getElementById('foodCustomSubcat').style.display = 'none';
  document.getElementById('foodSubcatRow').style.display = 'none';
  document.getElementById('foodPhotoGrid').innerHTML = '';
  document.getElementById('foodMapPreview').style.display = 'none';
  document.querySelectorAll('.food-cat-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.food-subcat-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.food-listpick-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.food-stars-input .star').forEach(function(s) { s.classList.remove('active'); });
}

/* Category selection */
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('food-cat-btn')) {
    document.querySelectorAll('.food-cat-btn').forEach(function(b) { b.classList.remove('active'); });
    e.target.classList.add('active');
    foodFormState.cat = e.target.dataset.cat;
    document.getElementById('foodSubcatRow').style.display = foodFormState.cat === 'food' ? 'block' : 'none';
  }
  if (e.target.classList.contains('food-subcat-btn')) {
    document.querySelectorAll('.food-subcat-btn').forEach(function(b) { b.classList.remove('active'); });
    e.target.classList.add('active');
    if (e.target.dataset.subcat === '__custom') {
      document.getElementById('foodCustomSubcat').style.display = 'block';
      foodFormState.subcat = '';
    } else {
      document.getElementById('foodCustomSubcat').style.display = 'none';
      foodFormState.subcat = e.target.dataset.subcat;
    }
  }
  if (e.target.classList.contains('food-listpick-btn')) {
    document.querySelectorAll('.food-listpick-btn').forEach(function(b) { b.classList.remove('active'); });
    e.target.classList.add('active');
    foodFormState.list = e.target.dataset.list;
  }
  if (e.target.classList.contains('food-filter-btn')) {
    document.querySelectorAll('.food-filter-btn').forEach(function(b) { b.classList.remove('active'); });
    e.target.classList.add('active');
    foodFilter.cat = e.target.dataset.cat;
    renderFoodBoard();
  }
  if (e.target.classList.contains('food-list-btn')) {
    document.querySelectorAll('.food-list-btn').forEach(function(b) { b.classList.remove('active'); });
    e.target.classList.add('active');
    foodFilter.list = e.target.dataset.list;
    renderFoodBoard();
  }
});

/* Star rating */
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('star') && e.target.closest('.food-stars-input')) {
    var val = parseInt(e.target.dataset.val);
    foodFormState.stars = val;
    document.querySelectorAll('.food-stars-input .star').forEach(function(s) {
      s.classList.toggle('active', parseInt(s.dataset.val) <= val);
    });
  }
});

/* Photo upload */
var foodPhotoFiles = [];
function handleFoodPhotos(input) {
  var files = Array.from(input.files);
  files.forEach(function(file) {
    if (file.size > 3 * 1024 * 1024) {
      alert('图片 ' + file.name + ' 超过3MB，请压缩后再上传');
      return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
      foodFormState.photos.push(e.target.result);
      renderFoodPhotos();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderFoodPhotos() {
  var grid = document.getElementById('foodPhotoGrid');
  if (!grid) return;
  grid.innerHTML = foodFormState.photos.map(function(src, i) {
    return '<div class="food-photo-item"><img src="' + src + '" /><button class="food-photo-remove" onclick="removeFoodPhoto(' + i + ')">×</button></div>';
  }).join('');
}

function removeFoodPhoto(idx) {
  foodFormState.photos.splice(idx, 1);
  renderFoodPhotos();
}

/* Geolocation */
function locateShop() {
  var name = document.getElementById('foodName').value.trim();
  var addr = document.getElementById('foodAddr').value.trim();
  var city = document.getElementById('foodCity').value.trim();
  if (!name && !addr) {
    alert('请先输入店铺名称或地址');
    return;
  }

  var query = [name, addr, city].filter(Boolean).join(' ');
  /* Try browser geolocation first */
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      foodFormState.lat = pos.coords.latitude;
      foodFormState.lng = pos.coords.longitude;
      showMapPreview(pos.coords.latitude, pos.coords.longitude, name || addr || '当前位置');
    }, function() {
      /* Fallback: just create a map link from the address text */
      var mapUrl = 'https://www.amap.com/search?query=' + encodeURIComponent(query);
      showMapPreviewText('已根据地址生成地图链接', mapUrl);
    }, { timeout: 5000 });
  } else {
    var mapUrl = 'https://www.amap.com/search?query=' + encodeURIComponent(query);
    showMapPreviewText('已根据地址生成地图链接', mapUrl);
  }
}

function showMapPreview(lat, lng, name) {
  var preview = document.getElementById('foodMapPreview');
  var info = document.getElementById('foodMapInfo');
  var link = document.getElementById('foodMapLink');
  info.textContent = '📍 ' + name + '（' + lat.toFixed(4) + ', ' + lng.toFixed(4) + '）';
  link.href = 'https://uri.amap.com/marker?position=' + lng + ',' + lat + '&name=' + encodeURIComponent(name);
  preview.style.display = 'block';
}

function showMapPreviewText(text, url) {
  var preview = document.getElementById('foodMapPreview');
  var info = document.getElementById('foodMapInfo');
  var link = document.getElementById('foodMapLink');
  info.textContent = '📍 ' + text;
  link.href = url;
  preview.style.display = 'block';
}

/* Submit review */
function submitFoodReview() {
  var name = document.getElementById('foodName').value.trim();
  var city = document.getElementById('foodCity').value.trim();
  var review = document.getElementById('foodReview').value.trim();
  var author = document.getElementById('foodAuthor').value.trim() || '匿名访客';
  var addr = document.getElementById('foodAddr').value.trim();
  var customSubcat = document.getElementById('foodCustomSubcat').value.trim();

  if (!name) { alert('请输入店铺名称'); return; }
  if (!city) { alert('请输入所在城市'); return; }
  if (!foodFormState.cat) { alert('请选择分类'); return; }
  if (!foodFormState.list) { alert('请选择红榜或黑榜'); return; }
  if (foodFormState.stars === 0) { alert('请选择星级评价'); return; }
  if (!review) { alert('请输入评价内容'); return; }

  var subcat = '';
  if (foodFormState.cat === 'food') {
    var activeSub = document.querySelector('.food-subcat-btn.active');
    if (activeSub) {
      if (activeSub.dataset.subcat === '__custom') {
        subcat = customSubcat || '';
      } else {
        subcat = activeSub.dataset.subcat;
      }
    }
  }

  var reviewData = {
    name: name,
    city: city,
    addr: addr,
    cat: foodFormState.cat,
    subcat: subcat,
    list: foodFormState.list,
    stars: foodFormState.stars,
    review: review,
    author: author,
    photos: foodFormState.photos,
    lat: foodFormState.lat || 0,
    lng: foodFormState.lng || 0,
    ts: Date.now()
  };

  var btn = document.querySelector('.food-submit-btn');
  btn.disabled = true;
  btn.textContent = '发布中...';

  if (useFirebase) {
    var newRef = db.ref('food_reviews').push();
    newRef.set(reviewData).then(function() {
      btn.disabled = false;
      btn.textContent = '发布评价';
      toggleFoodForm();
      /* Firebase on('value') will auto-refresh */
    }).catch(function(err) {
      console.error('Firebase save error:', err);
      /* Fallback to localStorage */
      foodData.unshift(reviewData);
      try { localStorage.setItem(FOOD_KEY, JSON.stringify(foodData)); } catch(e) {}
      btn.disabled = false;
      btn.textContent = '发布评价';
      toggleFoodForm();
      renderFoodBoard();
    });
  } else {
    foodData.unshift(reviewData);
    try { localStorage.setItem(FOOD_KEY, JSON.stringify(foodData)); } catch(e) {}
    btn.disabled = false;
    btn.textContent = '发布评价';
    toggleFoodForm();
    renderFoodBoard();
    updateCityFilter();
  }
}

/* Close form on overlay click */
document.addEventListener('DOMContentLoaded', function() {
  var overlay = document.getElementById('foodFormOverlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) toggleFoodForm();
    });
  }
  /* ESC to close */
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var ov = document.getElementById('foodFormOverlay');
      if (ov && ov.classList.contains('open')) toggleFoodForm();
    }
  });
  /* Load food reviews */
  loadFoodReviews();
});

/* Run visitor tracking on page load */
trackVisitor();

/* ===== Firebase Listeners Init (called after async Firebase load) ===== */
function initFirebaseListeners() {
  trackVisitor();
  /* Re-init visitor counter now that Firebase is ready */
  if (typeof initVisitorCounter === 'function') initVisitorCounter();
  /* Reload notes with Firebase if available now */
  var board = document.getElementById('messageBoard');
  if (board) {
    var cards = board.querySelectorAll('.note-card');
    cards.forEach(function(c) { c.remove(); });
  }
  if (typeof loadNotes === 'function') loadNotes();
  /* Reload thoughts from Firebase (will overwrite localStorage fallback) */
  if (typeof loadThoughts === 'function') {
    loadThoughts();
    console.log('Firebase ready, reloaded thoughts from cloud');
  }
  /* Reload food reviews from Firebase */
  if (typeof loadFoodReviews === 'function') loadFoodReviews();
}

/* ===== Top Nav scroll behavior ===== */
const topnav = document.getElementById('topnav');
const sections = document.querySelectorAll('section[id],header[id]');
const sidenavDots = document.querySelectorAll('.sidenav-dot');
const topnavLinks = document.querySelectorAll('.topnav-link');

let lastScroll = 0;
window.addEventListener('scroll', () => {
  const st = window.scrollY;
  // hide/show on scroll direction
  if (st > lastScroll && st > 200) { topnav.classList.add('hidden'); } else { topnav.classList.remove('hidden'); }
  if (st > 10) { topnav.classList.add('scrolled'); } else { topnav.classList.remove('scrolled'); }
  lastScroll = st;
  // update active dot
  let current = '';
  sections.forEach(s => {
    if (st >= s.offsetTop - 200) current = s.id;
  });
  sidenavDots.forEach(d => {
    d.classList.toggle('active', d.dataset.section === current);
  });
  topnavLinks.forEach(l => {
    const href = l.getAttribute('href').replace('#','');
    l.classList.toggle('active', href === current);
  });
});

/* ===== Thoughts Blog (Firebase real-time + localStorage fallback) ===== */
const THOUGHTS_KEY = 'eamon_thoughts';
const ADMIN_PASSWORD = 'eamon2026';
let isAdmin = sessionStorage.getItem('eamon_admin') === '1';
let thoughtsData = {};
let currentEdit = null;
let pendingAttachments = [];

/* Convert Firebase object-with-numeric-keys to array; pass-through if already array */
function thoughtsAsArray(cat) {
  var raw = thoughtsData[cat];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return Object.keys(raw).map(k => raw[k]).filter(p => p && p.ts);
  return [];
}

function getThoughts(cat) {
  return thoughtsAsArray(cat).sort((a,b) => b.ts - a.ts);
}

function saveThoughtsLocal() { localStorage.setItem(THOUGHTS_KEY, JSON.stringify(thoughtsData)); }

function getFileIcon(type, name) {
  if (type && type.startsWith('image/')) return '🖼️';
  if (type && type.startsWith('video/')) return '🎬';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return '📄';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return '📝';
  if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z')) return '📦';
  return '📎';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + 'KB';
  return (bytes/1024/1024).toFixed(1) + 'MB';
}

function renderAttachments(atts, inArticle) {
  if (!atts || !atts.length) return '';
  let html = '<div class="thought-article-attachments">';
  atts.forEach((att, idx) => {
    const icon = getFileIcon(att.type, att.name);
    if (inArticle && att.type && att.type.startsWith('image/')) {
      html += '<div class="thought-attach-preview"><img src="' + att.data + '" alt="' + att.name + '" /></div>';
    } else if (inArticle && att.type && att.type.startsWith('video/')) {
      html += '<div class="thought-attach-preview"><video src="' + att.data + '" controls preload="none" style="max-width:100%"></video></div>';
    } else {
      html += '<a class="thought-attach-item" href="' + att.data + '" download="' + att.name + '"><span class="icon">' + icon + '</span><span class="name">' + att.name + '</span></a>';
    }
  });
  html += '</div>';
  return html;
}

function renderPanel(cat) {
  const panel = document.getElementById('panel-' + cat);
  if (!panel) return;
  const posts = getThoughts(cat);
  if (!posts.length) {
    panel.innerHTML = '<div class="thought-empty">Coming Soon</div>';
    return;
  }
  panel.innerHTML = posts.map((p) => {
    const d = new Date(p.ts);
    const dateStr = d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
    var actionsHtml = '';
    if (isAdmin) {
      actionsHtml = '<div class="thought-article-actions">' +
        '<button onclick="event.stopPropagation();editThought(\'' + cat + '\',' + p.ts + ')">编辑</button>' +
        '<button onclick="event.stopPropagation();deleteThought(\'' + cat + '\',' + p.ts + ')">删除</button>' +
        '</div>';
    }
    var commentCount = (p.commentCount || 0);
    return '<div class="thought-article" onclick="openThought(\'' + cat + '\',' + p.ts + ')" data-ts="' + p.ts + '">' +
      '<div class="thought-article-meta"><span>' + dateStr + '</span>' + actionsHtml + '</div>' +
      '<div class="thought-article-title"><span>' + p.title + '</span><span class="arrow">→</span></div>' +
      (commentCount ? '<div class="thought-article-comments">💬 ' + commentCount + ' 条评论</div>' : '') +
    '</div>';
  }).join('');
}

function renderAllPanels() {
  ['ai-use','ai-product','creator','campaign'].forEach(renderPanel);
}

/* Load thoughts from Firebase (real-time) or localStorage (fallback) */
function loadThoughts() {
  if (useFirebase) {
    /* Always keep localStorage as offline cache */
    try {
      var cached = JSON.parse(localStorage.getItem(THOUGHTS_KEY) || '{}');
      if (typeof cached === 'object' && !Array.isArray(cached)) thoughtsData = cached;
    } catch(e) {}
    renderAllPanels(); /* Show cached data immediately */
    db.ref('thoughts').on('value', function(snapshot) {
      const val = snapshot.val() || {};
      /* Normalize: convert Firebase object-with-numeric-keys to arrays */
      thoughtsData = {};
      Object.keys(val).forEach(function(cat) {
        var items = val[cat];
        if (Array.isArray(items)) {
          thoughtsData[cat] = items;
        } else if (items && typeof items === 'object') {
          thoughtsData[cat] = Object.keys(items).map(k => items[k]).filter(p => p && p.ts);
        }
      });
      /* Sync normalized data to localStorage as cache */
      try { localStorage.setItem(THOUGHTS_KEY, JSON.stringify(thoughtsData)); } catch(e) {}
      renderAllPanels();
    });
  } else {
    try { thoughtsData = JSON.parse(localStorage.getItem(THOUGHTS_KEY) || '{}'); } catch(e) { thoughtsData = {}; }
    if (typeof thoughtsData !== 'object' || Array.isArray(thoughtsData)) thoughtsData = {};
    renderAllPanels();
  }
}

function deleteThought(cat, ts) {
  if (!confirm('确定要删除这篇文章吗？')) return;
  if (useFirebase) {
    db.ref('thoughts/' + cat).once('value').then(function(snap) {
      const raw = snap.val();
      var arr = Array.isArray(raw) ? raw : (raw ? Object.keys(raw).map(k => raw[k]) : []);
      const filtered = arr.filter(p => p.ts !== ts);
      db.ref('thoughts/' + cat).set(filtered);
    });
  } else {
    var arr = thoughtsAsArray(cat);
    if (!arr.length) return;
    thoughtsData[cat] = arr.filter(p => p.ts !== ts);
    saveThoughtsLocal();
    renderPanel(cat);
  }
  showToast('已删除');
}

function editThought(cat, ts) {
  const post = thoughtsAsArray(cat).find(p => p.ts === ts);
  if (!post) return;
  currentEdit = { cat, ts };
  document.querySelector('.writer-title').value = post.title;
  document.querySelector('.editor-content').innerHTML = post.content;
  document.querySelector('.writer-category').value = cat;
  pendingAttachments = post.attachments ? JSON.parse(JSON.stringify(post.attachments)) : [];
  renderAttachList();
  document.querySelector('.thoughts-writer').classList.add('open');
  document.querySelector('.writer-publish').textContent = '保存修改';
  closeThoughtModal();
  showToast('进入编辑模式，修改后点击保存');
}

function publishThought() {
  const title = document.querySelector('.writer-title').value.trim();
  const content = document.querySelector('.editor-content').innerHTML.trim();
  const cat = document.querySelector('.writer-category').value;
  if (!title || !content || content === '<br>') { showToast('标题和内容不能为空'); return; }
  if (currentEdit) {
    /* Capture edit context into locals BEFORE any async operations,
       because currentEdit and pendingAttachments are cleared synchronously below */
    var editCat = currentEdit.cat;
    var editTs = currentEdit.ts;
    var editAttachments = pendingAttachments.length ? JSON.parse(JSON.stringify(pendingAttachments)) : null;

    if (useFirebase) {
      db.ref('thoughts/' + editCat).once('value').then(function(snap) {
        const raw = snap.val();
        var arr = Array.isArray(raw) ? raw : (raw ? Object.keys(raw).map(k => raw[k]) : []);
        const idx = arr.findIndex(p => p.ts === editTs);
        if (idx !== -1) {
          arr[idx].title = title;
          arr[idx].content = content;
          arr[idx].attachments = editAttachments;
          arr[idx].updatedAt = Date.now();
          db.ref('thoughts/' + editCat).set(arr).then(function() {
            /* Also update local cache for immediate feedback */
            var localPost = thoughtsAsArray(editCat).find(p => p.ts === editTs);
            if (localPost) {
              localPost.title = title;
              localPost.content = content;
              localPost.attachments = editAttachments;
              localPost.updatedAt = Date.now();
              saveThoughtsLocal();
            }
            renderPanel(editCat);
            showToast('修改成功');
          }).catch(function(err) {
            console.error('Firebase write failed:', err);
            showToast('保存失败，请重试');
          });
        } else {
          console.warn('Post not found for ts:', editTs);
          showToast('未找到原文，请刷新后重试');
        }
      }).catch(function(err) {
        console.error('Firebase read failed:', err);
        showToast('读取数据失败，请重试');
      });
    } else {
      const post = thoughtsAsArray(editCat).find(p => p.ts === editTs);
      if (post) {
        post.title = title;
        post.content = content;
        post.attachments = editAttachments || undefined;
        post.updatedAt = Date.now();
        saveThoughtsLocal();
        renderPanel(editCat);
        showToast('修改成功');
      }
    }
    currentEdit = null;
    document.querySelector('.writer-publish').textContent = '发布';
  } else {
    const newPost = { title, content, ts: Date.now() };
    if (pendingAttachments.length) newPost.attachments = pendingAttachments;
    if (useFirebase) {
      db.ref('thoughts/' + cat).once('value').then(function(snap) {
        const raw = snap.val();
        var arr = Array.isArray(raw) ? raw : (raw ? Object.keys(raw).map(k => raw[k]) : []);
        arr.push(newPost);
        db.ref('thoughts/' + cat).set(arr);
        showToast('发布成功');
      });
    } else {
      if (!thoughtsData[cat]) thoughtsData[cat] = [];
      if (!Array.isArray(thoughtsData[cat])) thoughtsData[cat] = thoughtsAsArray(cat);
      thoughtsData[cat].push(newPost);
      saveThoughtsLocal();
      renderPanel(cat);
      showToast('发布成功');
    }
  }
  document.querySelector('.writer-title').value = '';
  document.querySelector('.editor-content').innerHTML = '';
  pendingAttachments = [];
  renderAttachList();
  document.querySelector('.thoughts-writer').classList.remove('open');
}

function handleAttachUpload(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  files.forEach(file => {
    if (file.size > 5 * 1024 * 1024) { showToast(file.name + ' 超过5MB限制，已跳过'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      pendingAttachments.push({ name: file.name, type: file.type, size: file.size, data: e.target.result });
      renderAttachList();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderAttachList() {
  const list = document.getElementById('attachList');
  if (!pendingAttachments.length) { list.innerHTML = ''; return; }
  list.innerHTML = pendingAttachments.map((att, i) => {
    const icon = getFileIcon(att.type, att.name);
    return '<div class="writer-attach-tag"><span>' + icon + ' ' + att.name + ' (' + formatFileSize(att.size) + ')</span><span class="remove" onclick="removeAttachment(' + i + ')">×</span></div>';
  }).join('');
}

function removeAttachment(idx) {
  pendingAttachments.splice(idx, 1);
  renderAttachList();
}

function switchThoughtTab(tabName) {
  const tab = document.querySelector('.thoughts-tab[data-tab="' + tabName + '"]');
  if (tab) tab.click();
}

document.querySelectorAll('.thoughts-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.thoughts-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.thoughts-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    var panel = document.getElementById('panel-' + tab.dataset.tab);
    if (panel) panel.classList.add('active');
  });
});

loadThoughts();

/* ===== Thought Modal ===== */
function openThought(cat, ts) {
  const post = thoughtsAsArray(cat).find(p => p.ts === ts);
  if (!post) return;
  const d = new Date(post.ts);
  const dateStr = d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
  document.getElementById('thoughtModalMeta').textContent = dateStr;
  document.getElementById('thoughtModalTitle').textContent = post.title;
  document.getElementById('thoughtModalBody').innerHTML = post.content;
  /* attachments */
  const attEl = document.getElementById('thoughtModalAttachments');
  const attachHtml = renderAttachments(post.attachments, true);
  if (attachHtml) {
    attEl.className = 'thought-modal-attachments';
    attEl.innerHTML = attachHtml;
  } else {
    attEl.className = '';
    attEl.innerHTML = '';
  }
  /* actions - only admin */
  const actionsEl = document.getElementById('thoughtModalActions');
  if (isAdmin) {
    actionsEl.style.display = '';
    actionsEl.innerHTML =
      '<button onclick="editThought(\'' + cat + '\',' + ts + ')">编辑</button>' +
      '<button onclick="deleteThought(\'' + cat + '\',' + ts + ');closeThoughtModal()">删除</button>' +
      '<button onclick="adminLogout()" style="margin-left:auto;opacity:0.6">退出管理</button>';
  } else {
    actionsEl.style.display = 'none';
    actionsEl.innerHTML = '';
  }
  /* comment section */
  loadArticleComments(cat, ts);
  document.getElementById('thoughtModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeThoughtModal() {
  document.getElementById('thoughtModal').classList.remove('open');
  document.body.style.overflow = '';
}

/* ===== Admin Login ===== */
function adminLogin() {
  var input = prompt('请输入管理密码：');
  if (input === ADMIN_PASSWORD) {
    isAdmin = true;
    sessionStorage.setItem('eamon_admin', '1');
    renderAllPanels();
    showToast('管理员已登录');
  } else if (input !== null) {
    showToast('密码错误');
  }
}

function adminLogout() {
  isAdmin = false;
  sessionStorage.removeItem('eamon_admin');
  renderAllPanels();
  closeThoughtModal();
  showToast('已退出管理');
}

function toggleWriter() {
  if (!isAdmin) {
    adminLogin();
    return;
  }
  document.querySelector('.thoughts-writer').classList.toggle('open');
}

/* ===== Article Comments ===== */
function loadArticleComments(cat, ts) {
  var commentEl = document.getElementById('thoughtModalComments');
  if (!commentEl) return;
  var commentId = cat + '_' + ts;
  var html = '<div class="article-comments-section">';
  html += '<h4 class="comments-title">💬 评论区</h4>';
  html += '<div class="comments-list" id="commentsList"></div>';
  html += '<div class="comment-input-area">';
  html += '<input type="text" id="commentName" placeholder="你的名字（可选）" maxlength="20" />';
  html += '<textarea id="commentText" placeholder="写点什么..." maxlength="500" rows="2"></textarea>';
  html += '<button onclick="submitComment(\'' + cat + '\',' + ts + ')">发送</button>';
  html += '</div>';
  html += '</div>';
  commentEl.innerHTML = html;
  if (useFirebase) {
    db.ref('article_comments/' + commentId).on('value', function(snapshot) {
      var comments = snapshot.val() || {};
      renderComments(comments);
    });
  } else {
    var local = JSON.parse(localStorage.getItem('eamon_art_comments_' + commentId) || '{}');
    renderComments(local);
  }
}

function renderComments(comments) {
  var listEl = document.getElementById('commentsList');
  if (!listEl) return;
  var arr = [];
  if (Array.isArray(comments)) arr = comments;
  else { for (var k in comments) arr.push(comments[k]); }
  arr.sort(function(a,b) { return (a.ts||0) - (b.ts||0); });
  if (!arr.length) {
    listEl.innerHTML = '<div class="comments-empty">还没有评论，快来抢沙发～</div>';
    return;
  }
  listEl.innerHTML = arr.map(function(c) {
    var name = c.name ? c.name.replace(/</g,'&lt;') : '匿名访客';
    var text = c.text ? c.text.replace(/</g,'&lt;') : '';
    var d = new Date(c.ts || Date.now());
    var timeStr = (d.getMonth()+1) + '月' + d.getDate() + '日 ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    return '<div class="comment-item">' +
      '<div class="comment-head"><span class="comment-name">' + name + '</span><span class="comment-time">' + timeStr + '</span></div>' +
      '<div class="comment-text">' + text + '</div>' +
    '</div>';
  }).join('');
}

function submitComment(cat, ts) {
  var nameEl = document.getElementById('commentName');
  var textEl = document.getElementById('commentText');
  if (!textEl) return;
  var name = nameEl ? nameEl.value.trim() : '';
  var text = textEl.value.trim();
  if (!text) { showToast('写点什么再发送呀'); return; }
  var comment = { name: name, text: text, ts: Date.now() };
  var commentId = cat + '_' + ts;
  if (useFirebase) {
    db.ref('article_comments/' + commentId).push().set(comment);
  } else {
    var local = JSON.parse(localStorage.getItem('eamon_art_comments_' + commentId) || '{}');
    var key = 'c' + Date.now();
    local[key] = comment;
    localStorage.setItem('eamon_art_comments_' + commentId, JSON.stringify(local));
    renderComments(local);
  }
  textEl.value = '';
  showToast('评论已发送');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeThoughtModal();
});

/* ===== Rich Text Editor Toolbar ===== */
(function initEditor() {
  const toolbarBtns = document.querySelectorAll('.editor-toolbar .tb-btn[data-cmd]');
  toolbarBtns.forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      document.execCommand(cmd, false, null);
      const editor = document.querySelector('.editor-content');
      if (editor) editor.focus();
      btn.classList.toggle('active');
      setTimeout(() => updateToolbarState(), 0);
    });
  });

  const sizeSelect = document.querySelector('.tb-select[data-cmd]');
  if (sizeSelect) {
    sizeSelect.addEventListener('change', e => {
      document.execCommand('fontSize', false, e.target.value);
      const editor = document.querySelector('.editor-content');
      if (editor) editor.focus();
    });
  }

  const colorInput = document.querySelector('.tb-color-input');
  if (colorInput) {
    colorInput.addEventListener('input', e => {
      const bar = document.querySelector('.tb-color-bar');
      if (bar) bar.style.background = e.target.value;
      document.execCommand('foreColor', false, e.target.value);
      const editor = document.querySelector('.editor-content');
      if (editor) editor.focus();
    });
  }

  const colorBtn = document.querySelector('.tb-color');
  if (colorBtn) {
    colorBtn.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT') return;
      e.preventDefault();
      const ci = document.querySelector('.tb-color-input');
      if (ci) ci.click();
    });
  }

  function updateToolbarState() {
    document.querySelectorAll('.editor-toolbar .tb-btn[data-cmd]').forEach(btn => {
      const cmd = btn.dataset.cmd;
      try {
        if (document.queryCommandState(cmd)) btn.classList.add('active');
        else btn.classList.remove('active');
      } catch(e) {}
    });
  }

  const editorEl = document.querySelector('.editor-content');
  if (editorEl) {
    editorEl.addEventListener('keyup', updateToolbarState);
    editorEl.addEventListener('mouseup', updateToolbarState);

    /* Handle paste: constrain image width on paste */
    editorEl.addEventListener('paste', function(e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      var hasImage = false;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          hasImage = true;
          var blob = items[i].getAsFile();
          var reader = new FileReader();
          reader.onload = function(ev) {
            var img = document.createElement('img');
            img.src = ev.target.result;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.borderRadius = 'var(--radius-sm)';
            img.style.display = 'block';
            img.style.margin = '8px 0';
            /* Insert at cursor position */
            var sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              var range = sel.getRangeAt(0);
              range.deleteContents();
              range.insertNode(img);
              range.setStartAfter(img);
              range.setEndAfter(img);
              sel.removeAllRanges();
              sel.addRange(range);
            } else {
              editorEl.appendChild(img);
            }
            attachImageResize(img);
          };
          reader.readAsDataURL(blob);
        }
      }
      if (hasImage) {
        e.preventDefault();
      }
    });

    /* Click to select image for resize */
    editorEl.addEventListener('click', function(e) {
      /* Remove previous selection */
      editorEl.querySelectorAll('img.resizable').forEach(function(img) {
        img.classList.remove('resizable');
      });
      var handles = editorEl.querySelectorAll('.img-resize-handle');
      handles.forEach(function(h) { h.remove(); });

      if (e.target.tagName === 'IMG' && e.target.closest('.editor-content')) {
        attachImageResize(e.target);
      }
    });

    /* Deselect on click outside images */
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.editor-content') && !e.target.classList.contains('img-resize-handle')) {
        editorEl.querySelectorAll('img.resizable').forEach(function(img) {
          img.classList.remove('resizable');
        });
        var handles = editorEl.querySelectorAll('.img-resize-handle');
        handles.forEach(function(h) { h.remove(); });
      }
    });
  }

  /* Attach resize handle to an image in the editor */
  function attachImageResize(img) {
    if (!img || !img.closest('.editor-content')) return;
    /* Make image relatively positioned for handle positioning */
    img.style.position = 'relative';
    img.classList.add('resizable');

    /* Remove old handles */
    img.parentElement.querySelectorAll('.img-resize-handle').forEach(function(h) { h.remove(); });

    /* Create resize handle */
    var handle = document.createElement('div');
    handle.className = 'img-resize-handle';
    img.parentElement.style.position = img.parentElement.style.position || 'relative';
    img.parentElement.appendChild(handle);

    function positionHandle() {
      var rect = img.getBoundingClientRect();
      var parentRect = img.parentElement.getBoundingClientRect();
      handle.style.left = (rect.right - parentRect.left - 7) + 'px';
      handle.style.top = (rect.bottom - parentRect.top - 7) + 'px';
    }
    positionHandle();
    /* Reposition on image load */
    if (!img.complete) {
      img.addEventListener('load', positionHandle);
    }

    var isResizing = false;
    var startX = 0, startY = 0, startW = 0, startH = 0;

    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = img.offsetWidth;
      startH = img.offsetHeight;
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function(e) {
      if (!isResizing) return;
      var dx = e.clientX - startX;
      var newW = Math.max(80, Math.min(startW + dx, editorEl.clientWidth - 40));
      var ratio = startH / startW;
      img.style.width = newW + 'px';
      img.style.height = 'auto';
      img.style.maxWidth = 'none';
      positionHandle();
    });

    document.addEventListener('mouseup', function() {
      if (isResizing) {
        isResizing = false;
        document.body.style.userSelect = '';
      }
    });
  }
})();

/* ===== Scroll Reveal ===== */
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.1 });
document.querySelectorAll('.fade').forEach(el => io.observe(el));

/* ===== Hero Staggered Entrance ===== */
document.querySelectorAll('.hero .fade').forEach((el, i) => {
  el.style.transitionDelay = (0.1 + i * 0.12) + 's';
  setTimeout(() => el.classList.add('in'), 50);
});

/* ===== Timeline Stagger ===== */
document.querySelectorAll('.timeline-item.fade').forEach((el, i) => {
  el.style.transitionDelay = (i * 0.18) + 's';
});

/* ===== Toast ===== */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

/* ===== Notes (Firebase real-time + localStorage fallback) ===== */
const NOTES_KEY = 'eamon_notes';
let notesData = [];

function saveNotes() { localStorage.setItem(NOTES_KEY, JSON.stringify(notesData)); }

function renderNoteCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card pin fade in';
  card.style.cssText = `--rot:${note.rot}deg`;
  card.dataset.ts = note.ts;
  if (note.id) card.dataset.id = note.id;
  let emojiHtml = '<div class="note-emoji-bar">';
  ['👍','🔥','😂'].forEach(e => {
    const count = (note.emojis && note.emojis[e]) || 0;
    emojiHtml += `<button class="emoji-btn" onclick="pickEmoji(this,'${e}')">${e} ${count}</button>`;
  });
  emojiHtml += '</div>';
  let repliesHtml = '';
  let replies = note.replies;
  if (replies && !Array.isArray(replies)) replies = Object.values(replies);
  if (replies && replies.length) {
    replies.forEach(r => {
      repliesHtml += `<div class="note-reply"><span class="reply-text">${r.text.replace(/</g,'&lt;')}</span><span class="reply-from">— Eamon</span><span class="reply-time">${r.time}</span></div>`;
    });
  }
  card.innerHTML = `<div class="q">${note.q.replace(/</g,'&lt;')}</div><div class="from">${note.from ? '— ' + note.from.replace(/</g,'&lt;') : '— 匿名'}</div><div class="note-time">${note.time}</div>${emojiHtml}<button class="note-reply-btn" onclick="replyNote(this)">回复</button>${repliesHtml}`;
  document.getElementById('notesBoard').prepend(card);
}

/* Real-time update: only refresh emoji counts and add new replies (no full re-render) */
function updateNoteCard(note) {
  const card = document.querySelector('.note-card[data-id="' + note.id + '"]');
  if (!card) return;
  card.querySelectorAll('.emoji-btn').forEach(b => {
    const parts = b.textContent.trim().split(' ');
    const em = parts[0];
    const count = (note.emojis && note.emojis[em]) || 0;
    b.textContent = em + ' ' + count;
  });
  let replies = note.replies;
  if (replies && !Array.isArray(replies)) replies = Object.values(replies);
  if (!replies) replies = [];
  const existingReplies = card.querySelectorAll('.note-reply').length;
  const replyBtn = card.querySelector('.note-reply-btn');
  if (replies.length > existingReplies && replyBtn) {
    for (let i = existingReplies; i < replies.length; i++) {
      const r = replies[i];
      const reply = document.createElement('div');
      reply.className = 'note-reply';
      reply.innerHTML = '<span class="reply-text">' + r.text.replace(/</g,'&lt;') + '</span><span class="reply-from">— Eamon</span><span class="reply-time">' + r.time + '</span>';
      card.insertBefore(reply, replyBtn);
    }
    const replyArea = card.querySelector('.note-reply-area');
    if (replyArea) replyArea.remove();
  }
}

function loadNotes() {
  if (useFirebase) {
    var loadedOnce = false;
    /* value: load ALL messages at once for complete initial render */
    db.ref('messages').orderByChild('ts').on('value', function(snapshot) {
      var board = document.getElementById('notesBoard');
      if (!board) return;
      /* Clear existing cards on first load or full refresh */
      board.querySelectorAll('.note-card').forEach(function(c) { c.remove(); });
      var val = snapshot.val();
      if (val) {
        /* Convert to array and sort by timestamp */
        var notes = Object.keys(val).map(function(key) {
          var note = val[key];
          note.id = key;
          if (note.replies && !Array.isArray(note.replies)) note.replies = Object.values(note.replies);
          if (!note.replies) note.replies = [];
          if (!note.emojis) note.emojis = {};
          return note;
        }).sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });
        /* Render all notes at once */
        notes.forEach(function(note) { renderNoteCard(note); });
      }
      /* Also cache to localStorage */
      try { localStorage.setItem(NOTES_KEY, JSON.stringify(notesData)); } catch(e) {}
      loadedOnce = true;
    });
    /* child_changed: fires when a message is updated (replies, emoji likes) */
    db.ref('messages').on('child_changed', function(snapshot) {
      const note = snapshot.val();
      note.id = snapshot.key;
      if (note.replies && !Array.isArray(note.replies)) note.replies = Object.values(note.replies);
      if (!note.replies) note.replies = [];
      if (!note.emojis) note.emojis = {};
      updateNoteCard(note);
    });
  } else {
    try { notesData = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch(e) { notesData = []; }
    if (!Array.isArray(notesData)) notesData = [];
    notesData.forEach(note => renderNoteCard(note));
  }
}

function addNote() {
  const q = document.getElementById('noteInput').value.trim();
  const from = document.getElementById('noteFrom').value.trim();
  if (!q) { showToast('写点什么再贴上去呀'); return; }
  const rot = parseFloat((Math.random() * 3 - 1.5).toFixed(1));
  const now = new Date();
  const timeStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const note = { q, from, time: timeStr, rot, ts: Date.now(), replies: [], emojis: {} };
  if (useFirebase) {
    db.ref('messages').push().set(note);
  } else {
    notesData.unshift(note);
    saveNotes();
    renderNoteCard(note);
  }
  document.getElementById('noteInput').value = '';
  document.getElementById('noteFrom').value = '';
  showToast('贴上去了');
}

function replyNote(btn) {
  const card = btn.closest('.note-card');
  if (!card) return;
  let replyArea = card.querySelector('.note-reply-area');
  if (replyArea) { replyArea.remove(); return; }
  replyArea = document.createElement('div');
  replyArea.className = 'note-reply-area';
  replyArea.innerHTML = '<input type="text" placeholder="回复..." /><button onclick="submitReply(this)">发送</button><div class="note-emoji-picker"><span onclick="addEmojiToReply(this)">👍</span><span onclick="addEmojiToReply(this)">❤️</span><span onclick="addEmojiToReply(this)">🔥</span><span onclick="addEmojiToReply(this)">😂</span><span onclick="addEmojiToReply(this)">🎉</span><span onclick="addEmojiToReply(this)">💯</span><span onclick="addEmojiToReply(this)">👏</span><span onclick="addEmojiToReply(this)">🙏</span></div>';
  card.appendChild(replyArea);
  replyArea.querySelector('input').focus();
}

function addEmojiToReply(span) {
  const input = span.closest('.note-reply-area').querySelector('input');
  input.value += span.textContent;
  input.focus();
}

function submitReply(btn) {
  const area = btn.closest('.note-reply-area');
  const card = btn.closest('.note-card');
  const text = area.querySelector('input').value.trim();
  if (!text) return;
  const now = new Date();
  const timeStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  if (useFirebase && card.dataset.id) {
    db.ref('messages/' + card.dataset.id + '/replies').push().set({ text, time: timeStr });
    area.remove();
  } else {
    const reply = document.createElement('div');
    reply.className = 'note-reply';
    reply.innerHTML = '<span class="reply-text">' + text.replace(/</g,'&lt;') + '</span><span class="reply-from">— Eamon</span><span class="reply-time">' + timeStr + '</span>';
    area.replaceWith(reply);
    const ts = parseInt(card.dataset.ts);
    const note = notesData.find(n => n.ts === ts);
    if (note) {
      if (!note.replies) note.replies = [];
      note.replies.push({ text, time: timeStr });
      saveNotes();
    }
  }
  showToast('已回复');
}

function pickEmoji(btn, emoji) {
  const card = btn.closest('.note-card');
  const parts = btn.textContent.trim().split(' ');
  const em = emoji || parts[0];
  let count = parseInt(parts[1] || 0);
  if (btn.classList.contains('picked')) {
    count = Math.max(0, count - 1);
    btn.classList.remove('picked');
  } else {
    count += 1;
    btn.classList.add('picked');
  }
  btn.textContent = em + ' ' + count;
  if (useFirebase && card.dataset.id) {
    /* Write to Firebase — all devices see the update in real-time */
    db.ref('messages/' + card.dataset.id + '/emojis/' + em).set(count);
  } else if (card && card.dataset.ts) {
    const ts = parseInt(card.dataset.ts);
    const note = notesData.find(n => n.ts === ts);
    if (note) {
      if (!note.emojis) note.emojis = {};
      note.emojis[em] = count;
      saveNotes();
    }
  }
}

/* load saved notes on page load */
loadNotes();

/* ===== Memory Modal ===== */
const memories = [
  {
    co: '芒果 TV · 晏吉超级工作室',
    role: '《密室大逃脱6》执行导演、微综编剧',
    cover: 'assets/mango/01.webp',
    coverLabel: '湖南广播电视台 · 长沙',
    coverPos: 'center 55%',
    content: [
      { type: 'p', text: '从《快乐大本营》入坑湖南卫视，童年记忆里的悲欢与综艺交织，第一次的实习谢谢雨凝姐帮我圆了电视梦！' },
      { type: 'fig', src: 'assets/mango/02.webp' },
      { type: 'p', text: '无限宠爱，一路高歌，谢谢你芒果TV，八岁生日快乐！' },
      { type: 'fig', src: 'assets/mango/03.webp' },
      { type: 'p', text: '微综立项发布！ah- moment！谢谢堃，带我在一次次逻辑闭环里，完成自己的第一个编剧作品。' },
      { type: 'p', text: '多奇妙的缘分，我们密逃小分队都来了北京，依旧做着自己喜欢的事情！' },
    ],
    gallery: ['assets/mango/04.webp']
  },
  {
    co: '快手科技 · 内容运营部',
    role: '青春娱乐垂类运营',
    cover: 'assets/kuaishou1/01.webp',
    coverLabel: '快手工牌 · 北京',
    content: [
      { type: 'p', text: '爱青娱！我的第一份互联网实习，帅杰是我的第一个面试官！' },
      { type: 'fig', src: 'assets/kuaishou1/02.jpg' },
      { type: 'p', text: '爱三金！爱乐瑶！一起出差两个月的革命友谊，一起熬过无数的夜！快手初代三人组会长长久久！我们在快手做了 Teen-six，做了高热达人，做了很 fancy 的事情。' },
      { type: 'video', src: 'assets/kuaishou1/video1.mp4', caption: 'Teen-six 直播' },
      { type: 'video', src: 'assets/kuaishou1/video2.mp4', caption: '那艺娜 直播' },
      { type: 'p', text: '西二旗的晚霞真的很好看，还有一直陪着我的实习搭子！' },
      { type: 'fig', src: 'assets/kuaishou1/03.webp' },
    ],
    gallery: ['assets/kuaishou1/04.webp', 'assets/kuaishou1/05.webp']
  },
  {
    co: '京东集团 · 电视影音事业部',
    role: '采销运营',
    cover: 'assets/jd/01.webp',
    coverLabel: '京东直播间 · 亦庄',
    coverPos: 'center 20%',
    content: [
      { type: 'p', text: '在京东，我从台前走到了幕后，以直播新人的身份重新上岗。' },
      { type: 'fig', src: 'assets/jd/02.webp' },
      { type: 'p', text: '入职培训三天，我们组拿了第一，那股子热血现在想起来还烫手。' },
      { type: 'fig', src: 'assets/jd/03.webp' },
      { type: 'p', text: '后来就是为京东卖命的无数个凌晨，说战斗一触即发一点都不夸张，但那些熬过来的夜晚，最后都变成了最踏实的东西。' },
    ],
    gallery: ['assets/jd/04.webp', 'assets/jd/05.webp']
  },
  {
    co: '字节跳动 · 即梦 AI',
    role: '创作者运营',
    cover: 'assets/jimeng/01.webp',
    coverLabel: '中关村 · 北京',
    content: [
      { type: 'p', text: '我经历了成长最快的一段日子。最前沿的视野、最体系的思维，这些词听起来很大，但落到每天的工作里，就是实打实的磨炼。谢谢你字节跳动，谢谢即梦，让我看见了自己还能走多远。' },
      { type: 'fig', src: 'assets/jimeng/02.webp' },
      { type: 'p', text: 'Seedance 2.0 上线，和正清就这样冲向热搜！当时的压力大大大大大！' },
      { type: 'p', text: '和王力宏合作全球首支交互式 AI 音乐电影上线！成就感满满。' },
      { type: 'link', icon: '🎵', title: '王力宏 × 即梦AI · Come What May', desc: '全球首支交互式 AI 音乐电影 · 抖音', href: 'https://v.douyin.com/WBkoRvDUQrE/' },
      { type: 'p', text: '通过策略、市场宣传让越来越多的 AI 短片创作者被看见有收益。' },
      { type: 'link', icon: '📄', title: 'AI 短片创作者生态实践', desc: '即梦 AI 创作者运营方法论', href: 'https://mp.weixin.qq.com/s/-OziPXMFtnqVEt_jQ5PwqQ' },
      { type: 'link', icon: '📄', title: 'AI 创作者增长策略', desc: '从 0 到 1 搭建 AI Skill 孵化体系', href: 'https://mp.weixin.qq.com/s/D-EWY-8LJ7A-yarCbkKLuA' },
      { type: 'p', text: '谢谢我的饭搭子们：立凯、玉涵、孙旭。谢谢职场互助所：舒凡、晨熙。谢谢神秘组织：C蒙、Yb、麻麻。' },
    ],
    gallery: []
  },
  {
    co: '快手科技 · 内容运营部',
    role: '内容生态商业中心运营',
    cover: 'assets/kuaishou2/01.webp',
    coverLabel: '北京',
    content: [
      { type: 'p', text: '通过信任和背书得到的暑期实习机会！和花姐、凯哥的故事 ing。' },
      { type: 'p', text: '离开的人也都会越来越好。' },
    ],
    gallery: []
  }
];

function openMemory(i) {
  const m = memories[i];
  document.getElementById('mCo').textContent = m.co;
  document.getElementById('mRole').textContent = m.role;
  document.getElementById('mEnd').textContent = '— ✦ —';

  // Cover
  const coverEl = document.getElementById('mCover');
  if (m.cover) {
    const pos = m.coverPos || '';
    coverEl.innerHTML = `<div class="memoir-cover"><img src="${m.cover}" alt="" loading="lazy" decoding="async"${pos ? ` style="object-position:${pos}"` : ''} />${m.coverLabel ? `<span class="cover-label">${m.coverLabel}</span>` : ''}</div>`;
  } else {
    coverEl.innerHTML = '';
  }

  // Article body: interleave text, figures, videos, links
  const articleEl = document.getElementById('mArticle');
  articleEl.innerHTML = m.content.map(c => {
    if (c.type === 'p') return `<p>${c.text}</p>`;
    if (c.type === 'fig') return `<div class="memoir-fig"><img src="${c.src}" alt="" loading="lazy" decoding="async" /></div>`;
    if (c.type === 'video') return `<div class="memoir-video"><video data-src="${c.src}" controls preload="none" playsinline></video><div class="video-loader">视频加载中…</div>${c.caption ? `<div class="video-caption">${c.caption}</div>` : ''}</div>`;
    if (c.type === 'link') return `<a class="memoir-link" href="${c.href}" target="_blank" rel="noopener"><div class="link-icon">${c.icon || '🔗'}</div><div class="link-body"><div class="link-title">${c.title}</div><div class="link-desc">${c.desc || ''}</div></div><span class="link-arrow">→</span></a>`;
    return '';
  }).join('');

  // Lazy-load videos via Intersection Observer
  var lazyVideos = articleEl.querySelectorAll('video[data-src]');
  if (lazyVideos.length > 0) {
    var videoObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var v = entry.target;
          var loader = v.nextElementSibling;
          v.src = v.dataset.src;
          v.preload = 'auto'; /* Allow full buffering for seekable progress bar */
          v.addEventListener('loadedmetadata', function() {
            if (loader) loader.style.display = 'none';
          }, { once: true });
          videoObserver.unobserve(v);
        }
      });
    }, { rootMargin: '200px' });
    lazyVideos.forEach(function(v) { videoObserver.observe(v); });
  }

  // Gallery for remaining photos
  const galleryEl = document.getElementById('mGallery');
  if (m.gallery && m.gallery.length > 0) {
    const cols = m.gallery.length >= 3 ? 'cols-3' : 'cols-2';
    galleryEl.innerHTML = `<div class="memoir-gallery ${cols}">${m.gallery.map(src =>
      `<div class="memoir-fig"><img src="${src}" alt="" loading="lazy" decoding="async" /></div>`
    ).join('')}</div>`;
  } else {
    galleryEl.innerHTML = '';
  }

  // Scroll modal to top & open
  document.getElementById('modal').scrollTop = 0;
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMemory() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMemory(); });

/* ===== Music Player ===== */
const playlist = [
  { song: '天空没有极限', artist: '邓紫棋', src: 'assets/sky-no-limit.mp3' }
];

let currentTrack = 0;
let isPlaying = false;
const audio = new Audio();
audio.preload = 'none'; /* Only load when user clicks play */
let audioLoaded = false;

const pSong = document.getElementById('pSong');
const pArtist = document.getElementById('pArtist');
const pBar = document.getElementById('pBar');
const pTime = document.getElementById('pTime');
const disc = document.getElementById('disc');
const playBtn = document.getElementById('playBtn');

function loadTrack(i) {
  currentTrack = i;
  const t = playlist[i];
  if (pSong) pSong.textContent = t.song;
  if (pArtist) pArtist.textContent = t.artist;
  audioLoaded = false;
  updateProgress();
}

function updateProgress() {
  const ct = audio.currentTime || 0;
  const dur = audio.duration || 1;
  const pct = (ct / dur) * 100;
  if (pBar) pBar.style.width = Math.min(pct, 100) + '%';
  if (!pTime) return;
  const cm = Math.floor(ct / 60);
  const cs = Math.floor(ct % 60);
  const dm = Math.floor(dur / 60);
  const ds = Math.floor(dur % 60);
  pTime.textContent = `${cm}:${String(cs).padStart(2,'0')} / ${dm}:${String(ds).padStart(2,'0')}`;
}

audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('waiting', function() {
  if (isPlaying && playBtn) playBtn.textContent = '⟳';
});
audio.addEventListener('playing', function() {
  if (isPlaying && playBtn) playBtn.textContent = '⏸';
});
audio.addEventListener('ended', () => {
  // loop
  audio.currentTime = 0;
  audio.play().catch(function(e) { console.warn('Loop play failed:', e); });
});

function togglePlay() {
  if (isPlaying) {
    pause();
  } else {
    play();
  }
}

function play() {
  isPlaying = true;
  if (disc) disc.classList.add('playing');
  var pHint = document.getElementById('pHint');
  if (pHint) pHint.classList.add('hide');
  if (!audioLoaded || audio.error) {
    /* Reset and retry load */
    audioLoaded = false;
    if (playBtn) playBtn.textContent = '⟳';
    audio.removeAttribute('src');
    audio.load(); /* Abort any previous load */
    var playStarted = false;
    function attemptPlay() {
      if (playStarted || !isPlaying) return;
      playStarted = true;
      audio.play().then(function() {
        if (playBtn) playBtn.textContent = '⏸';
      }).catch(function(err) {
        console.warn('Audio play failed:', err);
        if (playBtn) playBtn.textContent = '▶';
        isPlaying = false;
        if (disc) disc.classList.remove('playing');
      });
    }
    setTimeout(function() {
      audio.src = playlist[currentTrack].src;
      audio.load();
      audioLoaded = true;
    }, 50);
    audio.addEventListener('canplaythrough', function onReady() {
      audio.removeEventListener('canplaythrough', onReady);
      if (isPlaying) attemptPlay();
    });
    /* Fallback: if canplaythrough doesn't fire in 4s, try anyway */
    setTimeout(function() {
      if (isPlaying && !playStarted && audio.readyState >= 2) attemptPlay();
    }, 4000);
    audio.addEventListener('error', function onErr() {
      audio.removeEventListener('error', onErr);
      console.error('Audio load error, code:', audio.error ? audio.error.code : 'unknown');
      audioLoaded = false; /* Allow retry on next click */
      if (playBtn) playBtn.textContent = '▶';
      isPlaying = false;
      if (disc) disc.classList.remove('playing');
    });
  } else {
    audio.play().then(function() {
      if (playBtn) playBtn.textContent = '⏸';
    }).catch(function(err) {
      console.warn('Audio play failed:', err);
      if (playBtn) playBtn.textContent = '▶';
      isPlaying = false;
      if (disc) disc.classList.remove('playing');
    });
  }
}

function pause() {
  isPlaying = false;
  if (playBtn) playBtn.textContent = '▶';
  if (disc) disc.classList.remove('playing');
  audio.pause();
}

function next() {
  pause();
  loadTrack((currentTrack + 1) % playlist.length);
  play();
}

function prev() {
  pause();
  loadTrack((currentTrack - 1 + playlist.length) % playlist.length);
  play();
}

if(playBtn) playBtn.addEventListener('click', togglePlay);
var _nextBtn = document.getElementById('nextBtn');
if(_nextBtn) _nextBtn.addEventListener('click', next);
var _prevBtn = document.getElementById('prevBtn');
if(_prevBtn) _prevBtn.addEventListener('click', prev);

// progress bar click seek
var _progress = document.getElementById('progress');
if(_progress) _progress.addEventListener('click', (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const dur = audio.duration || 1;
  audio.currentTime = pct * dur;
});

// init
loadTrack(0);

// ===== FRIEND MATCH =====
const zodiacData = {
  aries:   { name: '白羊座',   element: 'fire',  emoji: '♈' },
  taurus:  { name: '金牛座',   element: 'earth', emoji: '♉' },
  gemini:  { name: '双子座',   element: 'air',   emoji: '♊' },
  cancer:  { name: '巨蟹座',   element: 'water', emoji: '♋' },
  leo:     { name: '狮子座',   element: 'fire',  emoji: '♌' },
  virgo:   { name: '处女座',   element: 'earth', emoji: '♍' },
  libra:   { name: '天秤座',   element: 'air',   emoji: '♎' },
  scorpio: { name: '天蝎座',   element: 'water', emoji: '♏' },
  sagittarius: { name: '射手座', element: 'fire', emoji: '♐' },
  capricorn:   { name: '摩羯座', element: 'earth', emoji: '♑' },
  aquarius:    { name: '水瓶座', element: 'air',   emoji: '♒' },
  pisces:      { name: '双鱼座', element: 'water', emoji: '♓' }
};

const mbtiData = {
  INTJ: { name: '建筑师',   role: 'analyst' },
  INTP: { name: '逻辑学家', role: 'analyst' },
  ENTJ: { name: '指挥官',   role: 'analyst' },
  ENTP: { name: '辩论家',   role: 'analyst' },
  INFJ: { name: '提倡者',   role: 'diplomat' },
  INFP: { name: '调停者',   role: 'diplomat' },
  ENFJ: { name: '主人公',   role: 'diplomat' },
  ENFP: { name: '竞选者',   role: 'diplomat' },
  ISTJ: { name: '检查员',   role: 'sentinel' },
  ISFJ: { name: '守卫者',   role: 'sentinel' },
  ESTJ: { name: '总经理',   role: 'sentinel' },
  ESFJ: { name: '执政官',   role: 'sentinel' },
  ISTP: { name: '鉴赏家',   role: 'explorer' },
  ISFP: { name: '探险家',   role: 'explorer' },
  ESTP: { name: '企业家',   role: 'explorer' },
  ESFP: { name: '表演者',   role: 'explorer' }
};

function getZodiacFromDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if ((m === 3 && day >= 21) || (m === 4 && day <= 19)) return 'aries';
  if ((m === 4 && day >= 20) || (m === 5 && day <= 20)) return 'taurus';
  if ((m === 5 && day >= 21) || (m === 6 && day <= 21)) return 'gemini';
  if ((m === 6 && day >= 22) || (m === 7 && day <= 22)) return 'cancer';
  if ((m === 7 && day >= 23) || (m === 8 && day <= 22)) return 'leo';
  if ((m === 8 && day >= 23) || (m === 9 && day <= 22)) return 'virgo';
  if ((m === 9 && day >= 23) || (m === 10 && day <= 23)) return 'libra';
  if ((m === 10 && day >= 24) || (m === 11 && day <= 22)) return 'scorpio';
  if ((m === 11 && day >= 23) || (m === 12 && day <= 21)) return 'sagittarius';
  if ((m === 12 && day >= 22) || (m === 1 && day <= 19)) return 'capricorn';
  if ((m === 1 && day >= 20) || (m === 2 && day <= 18)) return 'aquarius';
  return 'pisces';
}

function getChineseZodiac(dateStr) {
  if (!dateStr) return null;
  const year = new Date(dateStr).getFullYear();
  const animals = ['猴', '鸡', '狗', '猪', '鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊'];
  return animals[year % 12];
}

function calcLifeNumber(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  let sum = d.getDate() + (d.getMonth() + 1);
  while (sum > 9) {
    let s = 0;
    while (sum > 0) { s += sum % 10; sum = Math.floor(sum / 10); }
    sum = s;
  }
  return sum || 1;
}

function calcZodiacScore(zodiac) {
  if (!zodiac) return Math.floor(Math.random() * 20) + 60;
  const el = zodiacData[zodiac].element;
  const scores = { fire: 85, air: 82, earth: 72, water: 68 };
  let base = scores[el] || 70;
  base += Math.floor(Math.random() * 12) - 6;
  return Math.min(98, Math.max(50, base));
}

function calcMbtiScore(mbti) {
  if (!mbti || !mbtiData[mbti]) return Math.floor(Math.random() * 20) + 60;
  const role = mbtiData[mbti].role;
  const scores = { diplomat: 88, analyst: 80, explorer: 75, sentinel: 70 };
  let base = scores[role] || 70;
  if (['ENFP', 'ENFJ', 'ENTP', 'ENTJ'].indexOf(mbti) !== -1) base += 5;
  base += Math.floor(Math.random() * 10) - 5;
  return Math.min(98, Math.max(50, base));
}

function calcDestinyScore(dateStr) {
  if (!dateStr) return Math.floor(Math.random() * 20) + 60;
  const lifeNum = calcLifeNumber(dateStr);
  const numScores = { 1: 90, 2: 75, 3: 88, 4: 72, 5: 85, 6: 78, 7: 82, 8: 80, 9: 87 };
  let base = numScores[lifeNum] || 75;
  base += Math.floor(Math.random() * 10) - 5;
  return Math.min(98, Math.max(50, base));
}

function startMatch() {
  document.getElementById('matchStart').style.display = 'none';
  document.getElementById('matchForm').classList.add('active');
  /* Auto-match zodiac when birthday is entered */
  var birthInput = document.getElementById('matchBirth');
  if (birthInput && !birthInput.dataset.zodiacBound) {
    birthInput.dataset.zodiacBound = '1';
    birthInput.addEventListener('change', function() {
      if (this.value) {
        var autoZodiac = getZodiacFromDate(this.value);
        if (autoZodiac) {
          var zodiacSelect = document.getElementById('matchZodiac');
          zodiacSelect.value = autoZodiac;
          zodiacSelect.style.transition = 'background 0.3s';
          zodiacSelect.style.background = 'rgba(0,113,227,0.1)';
          setTimeout(function() { zodiacSelect.style.background = ''; }, 800);
        }
      }
    });
  }
}

function submitMatch() {
  var birth = document.getElementById('matchBirth').value;
  var zodiac = document.getElementById('matchZodiac').value;
  var mbti = document.getElementById('matchMbti').value;

  if (!birth && !zodiac) {
    showToast('请至少填写出生日期或选择星座~');
    return;
  }

  if (birth && !zodiac) {
    zodiac = getZodiacFromDate(birth);
    document.getElementById('matchZodiac').value = zodiac;
  }

  document.getElementById('matchForm').classList.remove('active');
  document.getElementById('matchLoading').classList.add('active');

  setTimeout(function() {
    showMatchResult(birth, zodiac, mbti);
  }, 2000);
}

function showMatchResult(birth, zodiac, mbti) {
  document.getElementById('matchLoading').classList.remove('active');
  document.getElementById('matchResult').classList.add('active');

  var zScore = calcZodiacScore(zodiac);
  var mScore = calcMbtiScore(mbti);
  var dScore = calcDestinyScore(birth);
  var total = Math.round((zScore * 0.35 + mScore * 0.35 + dScore * 0.3));

  var current = 0;
  var interval = setInterval(function() {
    current += 2;
    if (current >= total) {
      current = total;
      clearInterval(interval);
    }
    document.getElementById('matchPercent').textContent = current + '%';
  }, 25);

  var tag = '';
  if (total >= 90) tag = '天作之合';
  else if (total >= 80) tag = '灵魂共振';
  else if (total >= 70) tag = '志趣相投';
  else if (total >= 60) tag = '互补良缘';
  else tag = '缘分待续';
  document.getElementById('matchTag').textContent = tag;

  var zName = zodiac ? zodiacData[zodiac].name + ' ' + zodiacData[zodiac].emoji : '未知星座';
  var mName = mbti ? mbti + ' · ' + mbtiData[mbti].name : '未知类型';
  var animal = birth ? getChineseZodiac(birth) : '?';
  var lifeNum = birth ? calcLifeNumber(birth) : '?';

  var dims = [
    {
      icon: '🔮',
      title: '星座能量',
      score: zScore,
      color: 'var(--accent)',
      desc: '你的' + zName + '与陈一铭的星座磁场' + (zScore >= 80 ? '高度共振，你们在天性上就有很多共鸣。' : zScore >= 70 ? '相处融洽，星座特质互补。' : '虽然星座属性不同，但差异也是一种吸引力。')
    },
    {
      icon: '🧠',
      title: 'MBTI 契合',
      score: mScore,
      color: '#4fb0ff',
      desc: mName + '在思维方式上与陈一铭' + (mScore >= 80 ? '天然适配，你们的思维模式非常接近。' : mScore >= 70 ? '有不错的契合度，能互相理解。' : '有不同的思考角度，正好可以互相补充。')
    },
    {
      icon: '📿',
      title: '生辰密码',
      score: dScore,
      color: '#2997ff',
      desc: '生肖「' + animal + '」· 生命灵数「' + lifeNum + '」· 你的命理特质' + (dScore >= 80 ? '与陈一铭的气场高度匹配。' : dScore >= 70 ? '和陈一铭的能量场相处和谐。' : '与陈一铭形成了有趣的互补格局。')
    }
  ];

  var dimsEl = document.getElementById('matchDimensions');
  dimsEl.innerHTML = '';
  dims.forEach(function(dim) {
    var div = document.createElement('div');
    div.className = 'match-dim';
    div.innerHTML =
      '<div class="match-dim-header">' +
        '<div class="match-dim-icon">' + dim.icon + '</div>' +
        '<div class="match-dim-title">' + dim.title + '</div>' +
        '<div class="match-dim-score">' + dim.score + '分</div>' +
      '</div>' +
      '<div class="match-dim-bar">' +
        '<div class="match-dim-bar-inner" style="width:0%;background:' + dim.color + '"></div>' +
      '</div>' +
      '<p class="match-dim-desc">' + dim.desc + '</p>';
    dimsEl.appendChild(div);
    setTimeout(function() {
      div.querySelector('.match-dim-bar-inner').style.width = dim.score + '%';
    }, 300);
  });
}

function resetMatch() {
  document.getElementById('matchResult').classList.remove('active');
  document.getElementById('matchStart').style.display = 'block';
  document.getElementById('matchBirth').value = '';
  document.getElementById('matchZodiac').value = '';
  document.getElementById('matchMbti').value = '';
  document.getElementById('matchName').value = '';
}

// ===== CINEMA LIGHTBOX =====
var cinemaImgs = [], cinemaIdx = 0;
function openCinema(el) {
  var grid = el.closest('[data-cinema]');
  if (grid) {
    cinemaImgs = Array.from(grid.querySelectorAll('img')).map(function(i){return i.src});
    cinemaIdx = Array.from(grid.querySelectorAll('.life-img')).indexOf(el);
    if (cinemaIdx < 0) cinemaIdx = 0;
  } else {
    cinemaImgs = [el.querySelector('img').src];
    cinemaIdx = 0;
  }
  document.getElementById('cinemaImg').src = cinemaImgs[cinemaIdx];
  document.getElementById('cinemaCounter').textContent = cinemaImgs.length > 1 ? (cinemaIdx+1) + ' / ' + cinemaImgs.length : '';
  document.getElementById('cinemaCaption').textContent = '';
  var ov = document.getElementById('cinemaOverlay');
  ov.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCinema() {
  document.getElementById('cinemaOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
function cinemaNav(dir) {
  if (cinemaImgs.length <= 1) return;
  cinemaIdx = (cinemaIdx + dir + cinemaImgs.length) % cinemaImgs.length;
  var img = document.getElementById('cinemaImg');
  img.style.opacity = '0';
  img.style.transform = dir > 0 ? 'scale(0.95) translateX(20px)' : 'scale(0.95) translateX(-20px)';
  setTimeout(function(){
    img.src = cinemaImgs[cinemaIdx];
    document.getElementById('cinemaCounter').textContent = (cinemaIdx+1) + ' / ' + cinemaImgs.length;
    img.style.opacity = '1';
    img.style.transform = 'scale(1) translateX(0)';
  }, 150);
}
// cinema keyboard nav
document.addEventListener('keydown', function(e){
  var ov = document.getElementById('cinemaOverlay');
  if (!ov || !ov.classList.contains('open')) return;
  if (e.key === 'Escape') closeCinema();
  if (e.key === 'ArrowLeft') cinemaNav(-1);
  if (e.key === 'ArrowRight') cinemaNav(1);
});
// cinema init (runs after DOM ready because elements are after this script)
document.addEventListener('DOMContentLoaded', function(){
  var ov = document.getElementById('cinemaOverlay');
  if (ov) {
    ov.addEventListener('click', function(e){
      if (e.target === this || e.target.classList.contains('cinema-screen')) closeCinema();
    });
  }
  var cImg = document.getElementById('cinemaImg');
  if (cImg) {
    cImg.style.transition = 'opacity 0.15s ease, transform 0.25s cubic-bezier(0.25,1,0.5,1)';
  }
  /* Set decoding=async on all lazy images for non-blocking decode */
  document.querySelectorAll('img[loading="lazy"]:not([decoding])').forEach(function(img) {
    img.decoding = 'async';
  });
  /* Preload memoir images & videos during idle time */
  if (window.requestIdleCallback) {
    requestIdleCallback(preloadMemoirAssets, { timeout: 5000 });
  } else {
    setTimeout(preloadMemoirAssets, 3000);
  }
  /* Init visitor counter display */
  initVisitorCounter();
});

/* ===== Memoir Asset Preloader ===== */
function preloadMemoirAssets() {
  var preloaded = window._memoirPreloaded || {};
  window._memoirPreloaded = preloaded;
  memories.forEach(function(m) {
    if (m.cover && !preloaded[m.cover]) {
      preloaded[m.cover] = new Image();
      preloaded[m.cover].src = m.cover;
    }
    if (m.content) {
      m.content.forEach(function(c) {
        if (c.type === 'fig' && c.src && !preloaded[c.src]) {
          preloaded[c.src] = new Image();
          preloaded[c.src].src = c.src;
        }
        if (c.type === 'video' && c.src && !preloaded[c.src]) {
          var v = document.createElement('video');
          v.preload = 'metadata';
          v.src = c.src;
          preloaded[c.src] = v;
        }
      });
    }
    if (m.gallery) {
      m.gallery.forEach(function(src) {
        if (!preloaded[src]) {
          preloaded[src] = new Image();
          preloaded[src].src = src;
        }
      });
    }
  });
}

