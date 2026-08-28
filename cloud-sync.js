/* WebClass cloud bridge: server auth + PostgreSQL-backed app data. */
(() => {
  const API = String(window.WEBCLASS_API_URL || '').replace(/\/$/, '');
  const TOKEN_KEY = 'webclass-api-token';
  const SYNC_KEYS = [
    'xi-site-config','xi-schedules','xi-piket','xi-pro-tasks','xi-local-materials','xi-files',
    'xi-task-submissions','xi-tkj1-notes-v2','xi-tkj1-social-notes-v1','xi-tkj1-social-replies-v1'
  ];
  const cloudEnabled = API && !API.includes('YOUR-BACKEND');
  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';
  const headers = (json=true) => Object.assign({'Authorization':'Bearer '+token()}, json?{'Content-Type':'application/json'}:{});
  async function api(path, opts={}) {
    const r = await fetch(API+path, Object.assign({headers:headers(!!opts.body)}, opts));
    let body={}; try { body=await r.json(); } catch {}
    if(!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  }
  function localJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
  function setSessionFromUser(u, t) {
    sessionStorage.setItem(TOKEN_KEY,t);
    sessionStorage.setItem('xi-account-session', JSON.stringify({role:u.role,key:u.nisn||'admin',name:u.name,nisn:u.nisn,first:u.username||u.first}));
    window.dispatchEvent(new CustomEvent('xi-session-changed'));
  }
  async function pullCloudData() {
    if(!cloudEnabled || !token()) return;
    try {
      const [dataRes, studentsRes] = await Promise.all([api('/data'), api('/students')]);
      const remote=dataRes.data||{};
      for(const key of SYNC_KEYS) {
        if(Object.prototype.hasOwnProperty.call(remote,key)) localStorage.setItem(key, JSON.stringify(remote[key]));
        else if(localStorage.getItem(key) !== null) await api('/data/'+encodeURIComponent(key), {method:'PUT',body:JSON.stringify({value:localJson(key,null)})});
      }
      if(studentsRes.profiles) localStorage.setItem('xi-account-profiles',JSON.stringify(studentsRes.profiles));
      if(studentsRes.photos) localStorage.setItem('xi-account-photos',JSON.stringify(studentsRes.photos));
      try { window.renderTasks?.(); window.renderKnowledge?.(); window.renderStudents?.(); window.renderPiket?.(); } catch {}
      try { window.adminRender?.('overview'); } catch {}
    } catch(e) { console.warn('WebClass cloud sync:',e.message); }
  }
  async function syncKey(key, value) {
    if(!cloudEnabled || !token() || !SYNC_KEYS.includes(key)) return;
    try { await api('/data/'+encodeURIComponent(key), {method:'PUT',body:JSON.stringify({value})}); }
    catch(e) { console.warn('WebClass sync '+key+':',e.message); }
  }
  if(!cloudEnabled) {
    console.info('WebClass berjalan mode lokal. Isi config.js dengan URL backend untuk mengaktifkan server + database.');
    return;
  }

  /* Mirror localStorage writes to PostgreSQL for the existing UI. */
  const originalSet=Storage.prototype.setItem, originalRemove=Storage.prototype.removeItem;
  Storage.prototype.setItem=function(key,value){
    originalSet.call(this,key,value);
    if(this===localStorage && SYNC_KEYS.includes(key)) {
      let parsed=value; try { parsed=JSON.parse(value); } catch {}
      syncKey(key,parsed);
    }
  };
  Storage.prototype.removeItem=function(key){
    originalRemove.call(this,key);
    if(this===localStorage && SYNC_KEYS.includes(key) && token()) api('/data/'+encodeURIComponent(key),{method:'DELETE'}).catch(()=>{});
  };

  /* Cloud authentication gets first chance before the old local handlers. */
  document.getElementById('studentLoginForm')?.addEventListener('submit', async e => {
    e.preventDefault(); e.stopImmediatePropagation();
    const nisn=document.getElementById('studentUsername')?.value.trim(), password=document.getElementById('studentPassword')?.value;
    const err=document.getElementById('studentLoginError'); if(err) err.textContent='';
    try {
      const r=await api('/auth/student',{method:'POST',body:JSON.stringify({nisn,password})});
      setSessionFromUser(r.user,r.token); await pullCloudData();
      document.getElementById('studentLoginForm')?.reset(); window.renderAccount?.();
      document.getElementById('accountModal')?.classList.remove('show'); document.getElementById('accountModal')?.setAttribute('aria-hidden','true');
      window.welcomeToast?.('Welcome Di Website XI TKJ 1 '+r.user.name);
    } catch(ex) { if(err) err.textContent=ex.message; }
  }, true);

  document.getElementById('adminLoginForm')?.addEventListener('submit', async e => {
    e.preventDefault(); e.stopImmediatePropagation();
    const username=document.getElementById('adminUsername')?.value.trim(), password=document.getElementById('adminPassword')?.value;
    const err=document.getElementById('adminLoginError'); if(err) err.textContent='';
    try {
      const r=await api('/auth/admin',{method:'POST',body:JSON.stringify({username,password})});
      setSessionFromUser(r.user,r.token); await pullCloudData();
      document.getElementById('adminLoginForm')?.reset(); window.renderAccount?.();
      document.getElementById('accountModal')?.classList.remove('show'); document.getElementById('accountModal')?.setAttribute('aria-hidden','true');
      window.welcomeToast?.('Welcome Di Website XI TKJ 1 '+r.user.name);
    } catch(ex) { if(err) err.textContent=ex.message; }
  }, true);

  document.getElementById('accountLogout')?.addEventListener('click',()=>sessionStorage.removeItem(TOKEN_KEY),true);
  document.getElementById('adminLogout')?.addEventListener('click',()=>sessionStorage.removeItem(TOKEN_KEY),true);

  /* Save profile to users table instead of browser-only storage. */
  document.getElementById('profileConfirmYes')?.addEventListener('click', async e => {
    e.preventDefault(); e.stopImmediatePropagation();
    const s=JSON.parse(sessionStorage.getItem('xi-account-session')||'null'); if(!s?.nisn) return;
    try {
      const old=localJson('xi-account-profiles',{}), cur=old[s.nisn]||{};
      const profile={...cur,displayName:document.getElementById('profileNameInput')?.value.trim()||s.name,username:document.getElementById('profileUsernameInput')?.value.trim()||s.first,bio:document.getElementById('profileBioInput')?.value.trim()||'',interests:document.getElementById('profileInterestsInput')?.value.trim()||'',skills:document.getElementById('profileSkillsInput')?.value.trim()||'',motto:''};
      const r=await api('/profile',{method:'PUT',body:JSON.stringify({profile})});
      old[s.nisn]=r.user.profile; originalSet.call(localStorage,'xi-account-profiles',JSON.stringify(old)); setSessionFromUser(r.user,r.token);
      window.renderAccount?.(); document.getElementById('profileConfirmModal')?.classList.remove('show'); window.profileToast?.('Berhasil Merubah Data Account');
    } catch(ex) { window.toast?.('Gagal menyimpan profile: '+ex.message); }
  }, true);

  /* Admin Manage Account -> hashed password/profile in PostgreSQL. */
  document.getElementById('adminContent')?.addEventListener('click', async e => {
    const btn=e.target.closest('[data-save-account]'); if(!btn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const row=btn.closest('[data-account-row]'), nisn=btn.dataset.saveAccount;
    const name=row?.querySelector('[data-account-name]')?.value.trim(); const username=row?.querySelector('[data-account-username]')?.value.trim(); const password=row?.querySelector('[data-account-password]')?.value.trim();
    try { await api('/admin/students/'+encodeURIComponent(nisn),{method:'PUT',body:JSON.stringify({displayName:name,username,password:password||undefined})}); await pullCloudData(); window.adminRender?.('accounts'); window.toast?.('Account berhasil diperbarui di database'); }
    catch(ex) { window.toast?.('Gagal memperbarui account: '+ex.message); }
  }, true);

  /* If a session already exists, validate it and hydrate the UI. */
  if(token()) api('/me').then(r=>{
    const s=JSON.parse(sessionStorage.getItem('xi-account-session')||'null');
    if(!s) setSessionFromUser(r.user,token());
    return pullCloudData();
  }).catch(()=>{sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem('xi-account-session');});
  else {
    /* Public pages can still use their local demo data; once a user logs in it becomes cloud-backed. */
  }

  /* Student photo attendance: only visible after student login. */
  const attendanceLink=document.getElementById('studentAttendanceLink');
  const attendanceModal=document.getElementById('studentAttendanceModal');
  const attendanceVideo=document.getElementById('attendanceVideo');
  const attendanceCanvas=document.getElementById('attendanceCanvas');
  const attendancePreview=document.getElementById('attendancePreview');
  const attendanceStatus=document.getElementById('attendanceStatusText');
  const attendanceError=document.getElementById('attendanceError');
  const attendanceCapture=document.getElementById('attendanceCapture');
  const attendanceRetake=document.getElementById('attendanceRetake');
  const attendanceSend=document.getElementById('attendanceSend');
  let attendanceStream=null, attendancePhoto='';
  function stopAttendanceCamera(){ if(attendanceStream){ attendanceStream.getTracks().forEach(t=>t.stop()); attendanceStream=null; } }
  async function refreshAttendanceMenu(){
    const s=JSON.parse(sessionStorage.getItem('xi-account-session')||'null');
    if(!attendanceLink) return;
    attendanceLink.hidden=!(s?.role==='student');
    if(s?.role!=='student') return;
    try{
      const r=await api('/attendance/today');
      if(r.submitted){ attendanceLink.dataset.submitted='1'; attendanceLink.querySelector('span:last-child').textContent='Absensi ✓'; }
      else { attendanceLink.dataset.submitted='0'; attendanceLink.querySelector('span:last-child').textContent='Absensi'; }
    }catch{}
  }
  async function openAttendance(){
    if(!attendanceModal) return;
    attendanceModal.classList.add('show'); attendanceModal.setAttribute('aria-hidden','false');
    attendanceError.textContent=''; attendancePhoto=''; attendancePreview.hidden=true; attendanceSend.hidden=true; attendanceRetake.hidden=true; attendanceCapture.hidden=false;
    try{
      const r=await api('/attendance/today');
      if(r.submitted){ attendanceStatus.textContent='Absensi hari ini sudah terkirim. Kamu tidak perlu mengirim lagi.'; attendanceCapture.disabled=true; return; }
      attendanceStatus.textContent='Posisikan wajah dengan jelas, lalu ambil foto. Foto akan dikirim ke admin.'; attendanceCapture.disabled=false;
      if(!navigator.mediaDevices?.getUserMedia) throw new Error('Browser ini tidak mendukung kamera.');
      attendanceStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:720}},audio:false});
      attendanceVideo.srcObject=attendanceStream;
    }catch(e){ attendanceError.textContent=e.message||'Kamera tidak dapat dibuka.'; }
  }
  function closeAttendance(){stopAttendanceCamera(); attendanceModal?.classList.remove('show'); attendanceModal?.setAttribute('aria-hidden','true');}
  attendanceLink?.addEventListener('click',e=>{e.preventDefault();document.getElementById('mobileMenu')?.classList.remove('show');openAttendance();});
  document.getElementById('studentAttendanceClose')?.addEventListener('click',closeAttendance);
  attendanceModal?.addEventListener('click',e=>{if(e.target===attendanceModal)closeAttendance()});
  attendanceCapture?.addEventListener('click',()=>{
    if(!attendanceVideo?.videoWidth) return;
    const max=720, scale=Math.min(1,max/attendanceVideo.videoWidth,max/attendanceVideo.videoHeight);
    attendanceCanvas.width=Math.round(attendanceVideo.videoWidth*scale); attendanceCanvas.height=Math.round(attendanceVideo.videoHeight*scale);
    const ctx=attendanceCanvas.getContext('2d'); ctx.drawImage(attendanceVideo,0,0,attendanceCanvas.width,attendanceCanvas.height);
    attendancePhoto=attendanceCanvas.toDataURL('image/jpeg',0.78); attendancePreview.src=attendancePhoto; attendancePreview.hidden=false;
    attendanceCapture.hidden=true; attendanceRetake.hidden=false; attendanceSend.hidden=false; stopAttendanceCamera(); attendanceStatus.textContent='Foto siap dikirim. Pastikan wajah terlihat jelas.';
  });
  attendanceRetake?.addEventListener('click',()=>{attendancePhoto='';attendancePreview.hidden=true;attendanceSend.hidden=true;attendanceRetake.hidden=true;attendanceCapture.hidden=false;openAttendance();});
  attendanceSend?.addEventListener('click',async()=>{
    if(!attendancePhoto) return;
    attendanceSend.disabled=true; attendanceError.textContent='Mengirim absensi...';
    try{ await api('/attendance/photo',{method:'POST',body:JSON.stringify({photo:attendancePhoto})}); attendanceError.textContent=''; attendanceStatus.textContent='✅ Absensi berhasil dikirim ke admin.'; attendanceSend.hidden=true; attendanceRetake.hidden=true; attendanceCapture.hidden=true; attendanceLink.dataset.submitted='1'; attendanceLink.querySelector('span:last-child').textContent='Absensi ✓'; }
    catch(e){attendanceError.textContent=e.message||'Gagal mengirim absensi.';attendanceSend.disabled=false;}
  });
  async function renderRemoteAttendance(){
    const s=JSON.parse(sessionStorage.getItem('xi-account-session')||'null');
    if(s?.role!=='admin') return;
    const c=document.getElementById('adminContent'); if(!c) return;
    try{
      const r=await api('/attendance/today');
      const old=c.querySelector('#remoteAttendancePanel');
      if(old) old.remove();
      const panel=document.createElement('div'); panel.id='remoteAttendancePanel'; panel.style.cssText='margin-top:20px;padding:16px;border:1px solid var(--line,#ddd);border-radius:18px;background:var(--card,#fff)';
      const rows=(r.submissions||[]).map(x=>`<div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line,#ddd)"><img src="${x.photo_data||''}" alt="Foto ${x.name}" style="width:72px;height:72px;border-radius:12px;object-fit:cover;background:#eee"><div style="flex:1"><b>${window.escapeHTML?escapeHTML(x.name):x.name}</b><small style="display:block">NISN: ${x.nisn||'-'} • ${new Date(x.submitted_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</small><span>Hadir • Foto online</span></div><button class="mini-btn danger" data-delete-remote-attendance="${x.id}">Hapus</button></div>`).join('');
      panel.innerHTML=`<h3 style="margin:0 0 6px">📸 Absensi Foto Online</h3><p class="admin-help">Foto yang dikirim siswa masuk ke server dan dapat dilihat dari HP admin. Data hari ini: <b>${r.submissions?.length||0}</b> siswa.</p>${rows||'<div class="empty-state">Belum ada foto absensi masuk hari ini.</div>'}`;
      c.appendChild(panel);
      panel.querySelectorAll('[data-delete-remote-attendance]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Hapus kiriman absensi ini?'))return;try{await api('/attendance/'+b.dataset.deleteRemoteAttendance,{method:'DELETE'});renderRemoteAttendance()}catch(e){window.toast?.(e.message)}}));
    }catch(e){ console.warn('Remote attendance:',e.message); }
  }
  document.getElementById('adminContent')?.addEventListener('click',e=>{const tab=e.target.closest('.admin-tab');if(tab?.dataset.admin==='attendance')setTimeout(renderRemoteAttendance,150)},true);
  setInterval(()=>{const s=JSON.parse(sessionStorage.getItem('xi-account-session')||'null'); if(s?.role==='admin' && document.getElementById('remoteAttendancePanel')) renderRemoteAttendance();},10000);
  window.addEventListener('xi-session-changed',refreshAttendanceMenu);
  setTimeout(refreshAttendanceMenu,0);

})();
