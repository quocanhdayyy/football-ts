'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const storageKey = 'football-transfer-session';
  const v3MatchFields = ['v3-match-player','v3-match-requirement','v3-match-season','v3-match-role','v3-match-mode','v3-fee-tolerance','v3-wage-tolerance','v3-min-minutes','v3-min-score','v3-value-source','v3-match-shift','v3-match-save','v3-match-button','v3-search-button'];
  const strategyLabels = {
    MONEYBALL: { name: 'Tiết kiệm / Moneyball', description: 'Ưu tiên chi phí chuyển nhượng và mức lương phù hợp.' },
    BALANCED: { name: 'Cân bằng', description: 'Ưu tiên chuyên môn, kết hợp khả năng tài chính và tương lai.' },
    LONG_TERM: { name: 'Đầu tư dài hạn', description: 'Ưu tiên sức khỏe và khả năng bán lại trong tương lai.' },
    IMMEDIATE_ROLE: { name: 'Cần ngay vai trò', description: 'Ưu tiên đáp ứng ngay vai trò chuyên môn đội bóng cần.' },
  };
  let v3Strategies = null;
  let session = null;
  let busy = false;
  try { session = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { session = null; }
  if (!session || typeof session.accessToken !== 'string' || typeof session.expiresAt !== 'string') session = null;
  const saveSession = value => {
    session = value;
    try { if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey); } catch { /* Keep the session in memory when storage is unavailable. */ }
  };
  const message = (text, error = false) => {
    byId('message').textContent = text;
    byId('message').className = 'message ' + (error ? 'error' : 'success');
  };
  const setBusy = value => {
    busy = value;
    for (const id of ['login-button', 'refresh-button', 'logout-button', 'api-test-button', 'api-endpoint', 'api-record-id',
      ...v3MatchFields, 'v3-reload-button', 'v3-player', 'v3-season', 'v3-mode', 'v3-role', 'v3-shift', 'v3-squad-button']) byId(id).disabled = value;
    byId('v3-strategy').disabled = value || !v3Strategies;
    byId('login-button').textContent = value ? 'Đang xử lý…' : 'Đăng nhập →';
  };
  const showLogin = () => {
    saveSession(null);
    clearV3Strategies();
    byId('v3-match-result').textContent = ''; byId('v3-match-result').hidden = true;
    byId('v3-match-status').textContent = ''; byId('v3-match-breakdown').replaceChildren(); byId('v3-match-breakdown').hidden = true;
    byId('v3-match-requirement').value = ''; byId('v3-match-save').checked = false; byId('v3-match-shift').checked = false;
    for (const [id, value] of Object.entries({'v3-match-player':'1700','v3-match-season':'2025/2026','v3-match-mode':'PROTOTYPE','v3-fee-tolerance':'0','v3-wage-tolerance':'0','v3-min-minutes':'900','v3-min-score':'70','v3-value-source':''})) byId(id).value = value;
    byId('v3-squad-result').textContent = ''; byId('v3-squad-result').hidden = true;
    byId('v3-squad-status').textContent = ''; byId('v3-squad-breakdown').replaceChildren(); byId('v3-squad-breakdown').hidden = true;
    byId('v3-player').value = '1700'; byId('v3-season').value = '2025/2026'; byId('v3-mode').value = 'PROTOTYPE'; byId('v3-shift').checked = false;
    byId('login-panel').hidden = false;
    byId('account-panel').hidden = true;
    byId('password').value = '';
    byId('api-result').textContent = '';
    byId('api-result').hidden = true;
    byId('api-status').textContent = '';
    byId('api-record-id').value = '';

  };
  const showAccount = user => {
    byId('login-panel').hidden = true;
    byId('account-panel').hidden = false;
    byId('account-name').textContent = user.username;
    byId('account-email').textContent = user.email;
    byId('account-role').textContent = user.role === 'ADMIN' ? 'Quản trị viên (Admin)' : 'Người dùng (Scout)';
    byId('account-expiry').textContent = new Date(session.expiresAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    byId('password').value = '';
  };
  const clearV3Strategies = () => {
    v3Strategies = null;
    byId('v3-strategy').replaceChildren(); byId('v3-strategy').value = ''; byId('v3-strategy').disabled = true;
    byId('v3-weights').hidden = true; byId('v3-strategy-description').textContent = '';
    byId('v3-status').textContent = '';
    byId('v3-role').replaceChildren(); byId('v3-role').value = '';
    byId('v3-match-role').replaceChildren(); byId('v3-match-role').value = '';
    for (const key of ['financial', 'squad', 'risk']) byId('v3-weight-' + key).textContent = '';
  };
  const renderV3Strategy = () => {
    const key = byId('v3-strategy').value;
    const weights = v3Strategies && Object.hasOwn(v3Strategies, key) && Object.hasOwn(strategyLabels, key) ? v3Strategies[key] : null;
    byId('v3-weights').hidden = !weights;
    byId('v3-strategy-description').textContent = weights ? strategyLabels[key].description : '';
    for (const field of ['financial', 'squad', 'risk']) byId('v3-weight-' + field).textContent = weights ? (weights[field] * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + '%' : '';
    if (weights) {
      byId('v3-status').textContent = strategyLabels[key].name + ' · Tổng trọng số 100%. Bấm Tính Matching V3 để áp dụng.';
      byId('v3-status').className = 'message success';
    }
  };
  const loadV3Strategies = async () => {
    const accessToken = session?.accessToken;
    if (!accessToken) return;
    const previous = byId('v3-strategy').value;
    clearV3Strategies(); byId('v3-status').textContent = 'Đang tải chiến lược V3…'; byId('v3-status').className = 'message';
    try {
      const response = await fetch('/api/matching/v3/template', { headers: { Authorization: 'Bearer ' + accessToken }, cache: 'no-store' });
      const payload = await response.json();
      if (session?.accessToken !== accessToken) return;
      if (response.status === 401) { showLogin(); message('Phiên đã hết hạn. Vui lòng đăng nhập lại.', true); return; }
      if (!response.ok) throw new Error(payload.message || 'Không tải được cấu hình V3.');
      const strategies = payload.data?.strategies;
      if (!strategies || Object.keys(strategies).length !== Object.keys(strategyLabels).length || Object.keys(strategyLabels).some(key => {
        const w = strategies[key];
        return !w || ['financial', 'squad', 'risk'].some(field => typeof w[field] !== 'number' || !Number.isFinite(w[field]) || w[field] < 0 || w[field] > 1)
          || Math.abs(w.financial + w.squad + w.risk - 1) > 1e-8;
      })) throw new Error('Cấu hình chiến lược V3 chưa hợp lệ.');
      v3Strategies = strategies;
      const roleSelect = byId('v3-role'), emptyRole = document.createElement('option');
      emptyRole.value = ''; emptyRole.textContent = 'Các vai trò đủ điều kiện'; roleSelect.append(emptyRole);
      for (const role of payload.data.roles || []) {
        const option = document.createElement('option'); option.value = role.id; option.textContent = role.name + ' · ' + role.group; roleSelect.append(option);
      }
      const matchRoles = byId('v3-match-role'), placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Chọn vai trò'; matchRoles.append(placeholder);
      for (const role of payload.data.roles || []) { const option = document.createElement('option'); option.value = role.id; option.textContent = role.name + ' · ' + role.group; matchRoles.append(option); }
      for (const [key, label] of Object.entries(strategyLabels)) {
        const option = document.createElement('option'); option.value = key; option.textContent = label.name;
        byId('v3-strategy').append(option);
      }
      byId('v3-strategy').value = Object.hasOwn(strategies, previous) ? previous : 'BALANCED';
      renderV3Strategy();
    } catch (error) {
      byId('v3-status').textContent = error.message || 'Không tải được cấu hình V3. Bấm tải lại để thử lại.';
      byId('v3-status').className = 'message error';
    }
  };
  byId('v3-strategy').addEventListener('change', renderV3Strategy);
  const runV3Matching = async search => {
    if (busy || !session) return;
    const id = byId('v3-match-player').value.trim(), requirement = byId('v3-match-requirement').value.trim(), season = byId('v3-match-season').value.trim(), role = byId('v3-match-role').value;
    const integer = v => /^[0-9]+$/.test(v) && +v >= 1 && +v <= 2147483647;
    const numbers = ['v3-fee-tolerance','v3-wage-tolerance','v3-min-minutes','v3-min-score'].map(key => byId(key).value.trim());
    if ((!search && !integer(id)) || !integer(requirement) || !/^\d{4}\/\d{4}$/.test(season) || +season.slice(5) !== +season.slice(0,4) + 1 || !role || !v3Strategies
      || numbers.some(v => v === '' || !Number.isFinite(+v) || +v < 0) || +numbers[0] > 1000 || +numbers[1] > 1000 || !Number.isInteger(+numbers[2]) || +numbers[3] > 100) {
      byId('v3-match-status').textContent = 'Nhập ID yêu cầu CLB, vai trò, mùa và các điều kiện hợp lệ.'; return;
    }
    setBusy(true); byId('v3-match-status').textContent = 'Đang tính Matching V3…';
    byId('v3-match-breakdown').replaceChildren(); byId('v3-match-breakdown').hidden = true; byId('v3-match-result').hidden = true;
    try {
      const source = byId('v3-value-source').value.trim();
      const body = { requirementId: +requirement, season, roleIds: [role], strategy: byId('v3-strategy').value,
        options: { dataMode: byId('v3-match-mode').value, allowPositionShift: byId('v3-match-shift').checked === true, feeTolerance: +numbers[0]/100, wageTolerance: +numbers[1]/100, minMinutes: +numbers[2], minimumRoleScore: +numbers[3] },
        ...(source ? { valuationSource: source } : {}), ...(search ? { page:1,pageSize:10 } : { playerId:+id,save:byId('v3-match-save').checked===true }) };
      const response = await fetch('/api/matching/v3/' + (search ? 'search' : 'evaluate'), { method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.accessToken},body:JSON.stringify(body) });
      const payload = await response.json();
      if (response.status===401) { showLogin();message('Phiên đã hết hạn. Vui lòng đăng nhập lại.',true);return; }
      byId('v3-match-result').textContent = JSON.stringify(payload,null,2);byId('v3-match-result').hidden=false;
      if (!response.ok) throw new Error(payload.message || 'Không tính được Matching V3.');
      const d=payload.data,container=byId('v3-match-breakdown');container.hidden=false;
      const line=text=>{const p=document.createElement('p');p.textContent=text;container.append(p)};
      const show=r=>{
        const fmt=n=>n===null?'Chưa đủ dữ liệu':n+'/100';
        line(r.player.name+' · '+r.status+' · Tổng: '+fmt(r.totalScore));
        line('F: '+fmt(r.financialScore)+' · S: '+fmt(r.squadScore)+' · R: '+fmt(r.riskScore));
        if(r.missing.length)line('Thiếu: '+r.missing.join(', '));if(r.excluded.length)line('Bị loại: '+r.excluded.join(', '));
        for(const warning of r.prosCons.warnings)line(warning);
        if(r.saved)line('Đã lưu lịch sử #'+r.resultId);
      };
      if(search){byId('v3-match-status').textContent='Có '+d.meta.rankedCount+' người đủ điều kiện, '+d.meta.incompleteCount+' người thiếu dữ liệu, '+d.meta.excludedCount+' người bị loại.';for(const r of d.ranked)show(r);if(!d.ranked.length)for(const r of [...d.incomplete,...d.excluded].slice(0,10))show(r);line('Tìm kiếm không tự lưu lịch sử; chấm riêng và chọn Lưu lịch sử nếu muốn giữ một kết quả.');}
      else {byId('v3-match-status').textContent=d.complete?'Đã tính đủ điểm Matching V3.':d.status==='EXCLUDED'?'Cầu thủ không qua bộ lọc.':'Chưa đủ dữ liệu để tính điểm tổng.';show(d);}
      line('Trọng số đã dùng: F '+Math.round(d.config.pillarWeights.financial*100)+'% · S '+Math.round(d.config.pillarWeights.squad*100)+'% · R '+Math.round(d.config.pillarWeights.risk*100)+'%.');
    } catch(error) {byId('v3-match-status').textContent=error.message||'Không tải được Matching V3.';}
    finally {setBusy(false);}
  };
  byId('v3-matching-form').addEventListener('submit',async event=>{event.preventDefault();await runV3Matching(false)});
  byId('v3-search-button').addEventListener('click',()=>runV3Matching(true));
  byId('v3-reload-button').addEventListener('click', async () => {
    if (busy || !session) return;
    setBusy(true); try { await loadV3Strategies(); } finally { setBusy(false); }
  });
  byId('v3-squad-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    if (!session) { showLogin(); return; }
    const id = byId('v3-player').value.trim(), season = byId('v3-season').value.trim(), role = byId('v3-role').value;
    if (!/^[0-9]+$/.test(id) || +id < 1 || +id > 2147483647 || !/^\d{4}\/\d{4}$/.test(season) || +season.slice(5) !== +season.slice(0, 4) + 1) {
      byId('v3-squad-status').textContent = 'Nhập ID cầu thủ và mùa YYYY/YYYY liên tiếp hợp lệ.'; return;
    }
    setBusy(true); byId('v3-squad-status').textContent = 'Đang tính percentile và điểm vai trò…';
    byId('v3-squad-breakdown').replaceChildren(); byId('v3-squad-breakdown').hidden = true; byId('v3-squad-result').hidden = true;
    try {
      const response = await fetch('/api/matching/v3/squad/preview', { method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.accessToken },
        body: JSON.stringify({ playerId: Number(id), season, ...(role ? { roleIds: [role] } : {}), options: { dataMode: byId('v3-mode').value, allowPositionShift: byId('v3-shift').checked === true } }) });
      const payload = await response.json();
      if (response.status === 401) { showLogin(); message('Phiên đã hết hạn. Vui lòng đăng nhập lại.', true); return; }
      byId('v3-squad-result').textContent = JSON.stringify(payload, null, 2); byId('v3-squad-result').hidden = false;
      if (!response.ok) throw new Error(payload.message || 'Chưa tính được điểm vai trò.');
      const d = payload.data, container = byId('v3-squad-breakdown'); container.hidden = false;
      const fmt = n => n === null ? 'Chưa đủ dữ liệu' : Number(n.toFixed(2));
      const shown = d.roles.filter(r => role ? r.roleId === role : r.eligible);
      byId('v3-squad-status').textContent = d.player.name + ' · ' + d.player.position + ' · ' + d.minutesPlayed + ' phút · ' + d.dataMode;
      const line = text => { const p = document.createElement('p'); p.textContent = text; container.append(p); };
      line('Điểm phút: ' + fmt(d.minutesScore) + ' · Trần điểm: ' + fmt(d.cap) + ' · Tham chiếu: ' + d.reference.count + ' người.');
      const table = document.createElement('table'); table.className = 'squad-table';
      const row = (cells, heading = false) => { const tr = document.createElement('tr'); for (const text of cells) { const cell = document.createElement(heading ? 'th' : 'td'); cell.textContent = String(text); tr.append(cell); } table.append(tr); };
      row(['Vai trò', 'Q chuyên môn', 'Điểm cuối', 'Ước tính'], true);
      for (const r of shown) {
        row([r.roleName, fmt(r.quality), r.eligible ? fmt(r.score) : 'Chưa đủ điều kiện vị trí', Math.round(r.estimatedWeight * 100) + '% trọng số']);
      }
      container.append(table);
      if (!shown.length) line('Chưa có vai trò đủ điều kiện. Xem lý do trong JSON bên dưới.');
      for (const r of shown.filter(r => r.missing.length)) line(r.roleName + ': thiếu ' + r.missing.map(m => m.metric + ' (' + m.reason + ')').join(', '));
      if (d.ambiguousTopRole) line('Hai vai trò đầu cách nhau dưới 3 điểm; coi là gần tương đương.');
      for (const warning of d.warnings) line(warning);
      line('Cache: ' + (d.cache.hit ? 'dùng kết quả còn hợp lệ' : 'đã tính và cập nhật') + '. Chưa lưu lịch sử Matching.');
    } catch (error) { byId('v3-squad-status').textContent = error.message || 'Không tải được điểm vai trò.'; }
    finally { setBusy(false); }
  });
  const request = async (path, options = {}, authenticated = false) => {
    const response = await fetch('/api/auth' + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(authenticated && session ? { Authorization: 'Bearer ' + session.accessToken } : {}) },
      cache: 'no-store',
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.message || 'Không thể xử lý yêu cầu. Vui lòng thử lại.');
      error.status = response.status;
      throw error;
    }
    return payload;
  };
  const checkSession = async () => {
    if (!session || busy) return;
    setBusy(true);
    try {
      const payload = await request('/me', {}, true);
      showAccount(payload.data);
      await loadV3Strategies();
      if (session) message('Phiên đăng nhập đang hoạt động.');
    } catch (error) {
      if (error.status === 401) showLogin();
      message(error.message || 'Không kết nối được backend.', true);
    } finally { setBusy(false); }
  };
  byId('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); message('');
    try {
      const payload = await request('/login', {
        method: 'POST',
        body: JSON.stringify({ email: byId('email').value.trim(), password: byId('password').value }),
      });
      saveSession({ accessToken: payload.data.accessToken, expiresAt: payload.data.expiresAt });
      showAccount(payload.data.user);
      await loadV3Strategies();
      if (session) message('Đăng nhập thành công.');
    } catch (error) { message(error.message || 'Không kết nối được backend.', true); }
    finally { setBusy(false); }
  });
  byId('logout-button').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try { await request('/logout', { method: 'POST' }, true); showLogin(); message('Bạn đã đăng xuất.'); }
    catch (error) {
      if (error.status === 401) showLogin();
      message(error.message || 'Không thể đăng xuất. Vui lòng thử lại.', true);
    } finally { setBusy(false); }
  });
  byId('refresh-button').addEventListener('click', checkSession);
  const apiPaths = new Set([
    '/api/transfers', '/api/shortlist-lists', '/api/shortlist-items',
    '/api/notifications', '/api/scoring-configs', '/api/match-results',
    '/api/audit-logs', '/api/players', '/api/clubs', '/api/contracts',
    '/api/player-stats', '/api/injury-history', '/api/club-requirements', '/api/users',
    '/api/market-value-history', '/api/matching-inputs', '/api/player-data-verifications',
    '/api/matching/v3/template',
  ]);
  byId('api-test-button').addEventListener('click', async () => {
    if (busy) return;
    if (!session) { showLogin(); message('Bạn cần đăng nhập để thử API.', true); return; }
    const path = byId('api-endpoint').value;
    const id = byId('api-record-id').value.trim();
    if (!apiPaths.has(path) || (id && (!/^[0-9]+$/.test(id) || Number(id) < 1 || Number(id) > 2147483647))) {
      byId('api-status').textContent = 'Chọn API hợp lệ và nhập ID nguyên dương hoặc để trống.';
      byId('api-status').className = 'message error';
      byId('api-result').hidden = true;
      return;
    }
    const url = path + (id ? '/' + id : '');
    setBusy(true);
    byId('api-result').hidden = true;
    byId('api-result').textContent = '';
    byId('api-status').className = 'message';
    byId('api-status').textContent = 'Đang gửi GET ' + url + '…';
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + session.accessToken },
        cache: 'no-store',
      });
      const payload = await response.json();
      if (response.status === 401) {
        showLogin(); message('Phiên đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.', true);
        return;
      }
      const empty = response.ok && Array.isArray(payload.data) && payload.data.length === 0;
      byId('api-status').textContent = 'GET ' + url + ' — HTTP ' + response.status +
        (empty ? ' · Thành công, chưa có dữ liệu.' : response.ok ? ' · Thành công.' : ' · ' + (payload.message || 'Yêu cầu không thành công.'));
      byId('api-status').className = 'message ' + (response.ok ? 'success' : 'error');
      byId('api-result').textContent = JSON.stringify(payload, null, 2);
      byId('api-result').hidden = false;
    } catch {
      byId('api-status').textContent = 'Không đọc được kết quả. Kiểm tra backend đang chạy rồi thử lại.';
      byId('api-status').className = 'message error';
    } finally { setBusy(false); }
  });
  byId('toggle-password').addEventListener('click', () => {
    const visible = byId('password').type === 'password';
    byId('password').type = visible ? 'text' : 'password';
    byId('toggle-password').textContent = visible ? 'Ẩn' : 'Hiện';
    byId('toggle-password').setAttribute('aria-label', visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    byId('toggle-password').setAttribute('aria-pressed', String(visible));
  });
  if (session) checkSession();
})();
