// تحسينات تدريجية فقط: الموقع يعمل كاملاً من دون JavaScript.
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  // قائمة الأقسام على الهاتف
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('site-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      var open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  // نقل التركيز إلى ملخص الأخطاء حتى يسمعه قارئ الشاشة
  var errors = document.getElementById('form-errors');
  if (errors) errors.focus();

  // منع الإرسال المزدوج من دون تعطيل الزر (حتى تصل قيمة الزر المضغوط)
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.dataset.submitting) { e.preventDefault(); return; }
    form.dataset.submitting = '1';
    form.setAttribute('aria-busy', 'true');
    setTimeout(function () { delete form.dataset.submitting; form.removeAttribute('aria-busy'); }, 8000);
  });

  // معاينة الصور المختارة والتنبيه عند تجاوز العدد أو الحجم
  var input = document.querySelector('input[type=file][name=images]');
  var preview = document.querySelector('[data-preview]');
  if (input && preview) {
    input.addEventListener('change', function () {
      preview.textContent = '';
      var max = Number(input.dataset.max || 6);
      var files = Array.prototype.slice.call(input.files || []);
      var msg = '';
      if (files.length > max) msg = 'تقدر تضيف ' + max + ' صور كحد أقصى.';
      files.forEach(function (f) { if (f.size > 5 * 1024 * 1024) msg = 'الصورة «' + f.name + '» أكبر من ٥ ميغابايت.'; });
      input.setCustomValidity(msg);
      if (msg) { input.reportValidity(); return; }
      files.forEach(function (f) {
        var li = document.createElement('li');
        var img = document.createElement('img');
        img.alt = '';
        img.width = 120; img.height = 90;
        img.src = URL.createObjectURL(f);
        img.onload = function () { URL.revokeObjectURL(img.src); };
        li.appendChild(img);
        preview.appendChild(li);
      });
    });
  }

  // زر «موقعي الحالي» في نموذج النشاط التجاري
  var geo = document.querySelector('[data-geo]');
  if (geo && 'geolocation' in navigator) {
    geo.hidden = false;
    geo.addEventListener('click', function () {
      geo.disabled = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        document.getElementById('f-d_lat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('f-d_lng').value = pos.coords.longitude.toFixed(6);
        geo.disabled = false;
      }, function () { geo.disabled = false; alert('تعذّر تحديد الموقع. اسمح للموقع باستخدام الموقع الجغرافي أو اكتب الإحداثيات يدوياً.'); }, { enableHighAccuracy: true, timeout: 15000 });
    });
  }
})();
