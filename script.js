/* =========================================================================
   ESCALA DA FAMÍLIA — lógica da aplicação
   100% front-end: os dados vivem no LocalStorage do navegador.
   Estrutura pensada para, no futuro, trocar as funções `loadX/saveX`
   por chamadas a um backend (Firebase/Supabase) sem mexer no resto do app.
   ========================================================================= */

(() => {
  'use strict';

  /* ---------------------------------------------------------------------
   * 1. CONSTANTES E ESTADO
   * ------------------------------------------------------------------- */
  const STORAGE = {
    shifts: 'escala_shifts',
    availability: 'escala_availability',
    peopleColors: 'escala_people_colors',
    seeded: 'escala_seeded_v1'
  };

  // Paleta suave e distinguível para identificar cada acompanhante
  const PALETTE = [
    '#2F6F6B', '#C97B4A', '#7B6BA8', '#4A7FA0',
    '#A8637B', '#6B8E4E', '#B8965A', '#5C7C89',
    '#8A5A6E', '#4F8F72'
  ];

  const DOW_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const DOW_LONG  = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const MONTHS    = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const ROW_H = 46; // deve bater com --row-h no CSS

  let state = {
    shifts: [],
    availability: [],
    peopleColors: {},
    weekStart: getMonday(new Date()),
    search: '',
    dayFilter: '',
    pendingDelete: null // { type:'shift'|'availability', id }
  };

  /* ---------------------------------------------------------------------
   * 2. UTILITÁRIOS DE DATA / HORA
   * ------------------------------------------------------------------- */
  function pad2(n){ return String(n).padStart(2, '0'); }

  function toDateKey(date){
    return `${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}`;
  }

  function parseDateKey(key){
    const [y,m,d] = key.split('-').map(Number);
    return new Date(y, m-1, d);
  }

  function getMonday(date){
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay(); // 0=Dom
    const diff = (day === 0 ? -6 : 1 - day); // volta até segunda
    d.setDate(d.getDate() + diff);
    return d;
  }

  function addDays(date, n){
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function getWeekDays(weekStart){
    return Array.from({length:7}, (_,i) => addDays(weekStart, i));
  }

  function timeToMinutes(t){
    const [h,m] = t.split(':').map(Number);
    return h*60+m;
  }

  function minutesToTime(min){
    min = ((min % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(min/60))}:${pad2(min%60)}`;
  }

  function shiftDuration(start, end){
    let dur = timeToMinutes(end) - timeToMinutes(start);
    if (dur <= 0) dur += 1440;
    return dur;
  }

  function formatDurationLabel(min){
    const h = Math.floor(min/60), m = min%60;
    if (h && m) return `${h}h${pad2(m)}`;
    if (h) return `${h}h`;
    return `${m}min`;
  }

  function shiftStartDateTime(shift){
    return new Date(`${shift.date}T${shift.start}:00`);
  }

  function shiftEndDateTime(shift){
    const start = shiftStartDateTime(shift);
    let end = new Date(`${shift.date}T${shift.end}:00`);
    if (end <= start) end = new Date(end.getTime() + 24*3600*1000);
    return end;
  }

  function formatWeekLabel(weekStart){
    const end = addDays(weekStart, 6);
    const sameMonth = weekStart.getMonth() === end.getMonth();
    if (sameMonth){
      return `${weekStart.getDate()} – ${end.getDate()} de ${MONTHS[end.getMonth()]} de ${end.getFullYear()}`;
    }
    return `${weekStart.getDate()} de ${MONTHS[weekStart.getMonth()]} – ${end.getDate()} de ${MONTHS[end.getMonth()]} de ${end.getFullYear()}`;
  }

  /* ---------------------------------------------------------------------
   * 3. PERSISTÊNCIA (LocalStorage)
   *    -> Ponto único de troca futura para Firebase/Supabase.
   * ------------------------------------------------------------------- */
  function loadAll(){
    try{
      state.shifts = JSON.parse(localStorage.getItem(STORAGE.shifts)) || [];
      state.availability = JSON.parse(localStorage.getItem(STORAGE.availability)) || [];
      state.peopleColors = JSON.parse(localStorage.getItem(STORAGE.peopleColors)) || {};
    }catch(e){
      console.error('Erro ao carregar dados salvos, iniciando vazio.', e);
      state.shifts = []; state.availability = []; state.peopleColors = {};
    }
  }

  function saveShifts(){ localStorage.setItem(STORAGE.shifts, JSON.stringify(state.shifts)); }
  function saveAvailability(){ localStorage.setItem(STORAGE.availability, JSON.stringify(state.availability)); }
  function savePeopleColors(){ localStorage.setItem(STORAGE.peopleColors, JSON.stringify(state.peopleColors)); }

  function getPersonColor(name){
    const key = name.trim().toLowerCase();
    if (!state.peopleColors[key]){
      const usedCount = Object.keys(state.peopleColors).length;
      state.peopleColors[key] = PALETTE[usedCount % PALETTE.length];
      savePeopleColors();
    }
    return state.peopleColors[key];
  }

  function seedDemoDataIfEmpty(){
    if (localStorage.getItem(STORAGE.seeded)) return;
    localStorage.setItem(STORAGE.seeded, '1');
    if (state.shifts.length || state.availability.length) return;

    const today = new Date();
    const monday = getMonday(today);
    const d = (n) => toDateKey(addDays(monday, n));

    state.shifts = [
      { id: uid(), name: 'João', date: d(0), start: '18:00', end: '07:00', notes: 'Pode dormir no hospital' },
      { id: uid(), name: 'Marta', date: d(1), start: '07:00', end: '13:00', notes: '' },
      { id: uid(), name: 'Marta', date: d(1), start: '12:30', end: '18:00', notes: 'Sobreposição de exemplo' },
      { id: uid(), name: 'Carlos', date: d(1), start: '13:00', end: '18:00', notes: '' },
      { id: uid(), name: 'João', date: d(2), start: '18:00', end: '07:00', notes: '' },
      { id: uid(), name: 'Carlos', date: d(4), start: '07:00', end: '18:00', notes: 'Leva os exames' },
    ];
    state.availability = [
      { id: uid(), name: 'Marta', days: [1,3,5], start: '18:00', end: '07:00', notes: 'Prefiro plantões noturnos' },
    ];
    saveShifts(); saveAvailability();
  }

  function uid(){
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  }

  /* ---------------------------------------------------------------------
   * 4. CÁLCULO DE SEGMENTOS, LACUNAS E SOBREPOSIÇÕES
   * ------------------------------------------------------------------- */

  // Converte cada plantão em 1 ou 2 "segmentos" (divide plantões que viram a noite)
  function shiftToSegments(shift){
    const startMin = timeToMinutes(shift.start);
    let endMin = timeToMinutes(shift.end);
    if (endMin <= startMin) endMin += 1440;

    if (endMin <= 1440){
      return [{ dateKey: shift.date, startMin, endMin, shift }];
    }
    // vira a noite: parte 1 termina à meia-noite, parte 2 começa à meia-noite no dia seguinte
    const nextDateKey = toDateKey(addDays(parseDateKey(shift.date), 1));
    return [
      { dateKey: shift.date, startMin, endMin: 1440, shift },
      { dateKey: nextDateKey, startMin: 0, endMin: endMin - 1440, shift }
    ];
  }

  function allSegments(){
    return state.shifts.flatMap(shiftToSegments);
  }

  // Monta, para uma data específica, os segmentos + layout de colunas (sobreposição) + lacunas
  function computeDayData(dateKey, segmentsForDate){
    const segs = segmentsForDate
      .slice()
      .sort((a,b) => a.startMin - b.startMin || a.endMin - b.endMin);

    // pares que se sobrepõem (para alertas e destaque amarelo)
    const overlapIds = new Set();
    for (let i=0;i<segs.length;i++){
      for (let j=i+1;j<segs.length;j++){
        if (segs[j].startMin < segs[i].endMin && segs[j].shift.id !== segs[i].shift.id){
          overlapIds.add(segs[i].shift.id);
          overlapIds.add(segs[j].shift.id);
        }
      }
    }

    // layout em colunas (estilo Google Calendar) para os que se sobrepõem
    const columnsEnd = []; // fim de cada coluna ocupada
    segs.forEach(seg => {
      let col = columnsEnd.findIndex(end => end <= seg.startMin);
      if (col === -1){ col = columnsEnd.length; columnsEnd.push(seg.endMin); }
      else { columnsEnd[col] = seg.endMin; }
      seg.col = col;
    });
    // define quantas colunas cada segmento "enxerga" simultaneamente
    segs.forEach(seg => {
      const concorrentes = segs.filter(o => o.startMin < seg.endMin && seg.startMin < o.endMin);
      seg.totalCols = Math.max(1, ...concorrentes.map(c => c.col+1));
      seg.isOverlap = overlapIds.has(seg.shift.id);
    });

    // lacunas: complemento dos intervalos ocupados em 0..1440
    const merged = [];
    segs.slice().sort((a,b)=>a.startMin-b.startMin).forEach(seg => {
      const last = merged[merged.length-1];
      if (last && seg.startMin <= last.end) last.end = Math.max(last.end, seg.endMin);
      else merged.push({ start: seg.startMin, end: seg.endMin });
    });
    const gaps = [];
    let cursor = 0;
    merged.forEach(m => {
      if (m.start > cursor) gaps.push({ start: cursor, end: m.start });
      cursor = Math.max(cursor, m.end);
    });
    if (cursor < 1440) gaps.push({ start: cursor, end: 1440 });

    return { dateKey, segments: segs, gaps, hasOverlap: overlapIds.size>0 };
  }

  function computeWeekData(weekDays){
    const segs = allSegments();
    return weekDays.map(date => {
      const key = toDateKey(date);
      const segsForDate = segs.filter(s => s.dateKey === key);
      return computeDayData(key, segsForDate);
    });
  }

  /* ---------------------------------------------------------------------
   * 5. RENDERIZAÇÃO — AGENDA (grade semanal)
   * ------------------------------------------------------------------- */
  const el = (id) => document.getElementById(id);

  function render(){
    const weekDays = getWeekDays(state.weekStart);
    const weekData = computeWeekData(weekDays);
    el('weekLabel').textContent = formatWeekLabel(state.weekStart);
    renderLegend('legendaPessoas', state.shifts.map(s => s.name));
    renderCalendar(weekDays, weekData);
    renderSummary(weekDays, weekData);
    renderAlerts(weekDays, weekData);
    renderAvailability();
    renderAvailabilityCalendar();
    renderNamesDatalist();
  }

  function renderLegend(elementId, names){
    const box = el(elementId);
    const unique = Array.from(new Set(names)).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    if (!unique.length){ box.innerHTML = ''; return; }
    box.innerHTML = unique.map(name => `
      <span class="legend-item">
        <span class="legend-dot" style="background:${getPersonColor(name)}"></span>${escapeHtml(name)}
      </span>`).join('');
  }

  function buildHoursColumn(){
    const hoursCol = makeDiv('cal-hours');
    hoursCol.style.gridRow = '2';
    hoursCol.style.gridColumn = '1';
    for (let h=0; h<24; h++){
      const lbl = makeDiv('cal-hour-label');
      lbl.textContent = `${pad2(h)}:00`;
      hoursCol.appendChild(lbl);
    }
    hoursCol.style.height = `${24*ROW_H}px`;
    return hoursCol;
  }

  function renderCalendar(weekDays, weekData){
    const grid = el('calendarGrid');
    const now = new Date();
    const todayKey = toDateKey(now);
    grid.innerHTML = '';

    // canto superior esquerdo
    grid.appendChild(makeDiv('cal-corner'));

    // cabeçalho dos dias
    weekDays.forEach((date, i) => {
      const key = toDateKey(date);
      const isToday = key === todayKey;
      const isDimmed = state.dayFilter !== '' && String(date.getDay()) !== state.dayFilter;
      const header = makeDiv(`cal-daycol-header${isToday?' is-today':''}${isDimmed?' is-dimmed':''}`);
      header.innerHTML = `<div class="dow">${DOW_SHORT[date.getDay()]}</div><div class="dom">${date.getDate()}</div>`;
      grid.appendChild(header);
    });

    // coluna de horas
    grid.appendChild(buildHoursColumn());

    // colunas dos dias
    weekDays.forEach((date, i) => {
      const key = toDateKey(date);
      const day = weekData[i];
      const isToday = key === todayKey;
      const isDimmed = state.dayFilter !== '' && String(date.getDay()) !== state.dayFilter;
      const col = makeDiv(`cal-daycol${isToday?' is-today':''}${isDimmed?' is-dimmed':''}`);
      col.style.height = `${24*ROW_H}px`;
      col.style.gridColumn = String(i+2);
      col.style.gridRow = '2';

      // lacunas (vermelho)
      day.gaps.forEach(g => {
        const gapEl = makeDiv('cal-gap');
        gapEl.style.top = `${g.start/60*ROW_H}px`;
        gapEl.style.height = `${Math.max(2,(g.end-g.start)/60*ROW_H)}px`;
        if ((g.end-g.start) >= 40){
          gapEl.innerHTML = `<div class="cal-gap-label">Sem acompanhante</div>`;
        }
        col.appendChild(gapEl);
      });

      // plantões
      day.segments.forEach(seg => {
        const matchesSearch = !state.search || seg.shift.name.toLowerCase().includes(state.search);
        const width = 100/seg.totalCols;
        const left = seg.col*width;
        const block = document.createElement('div');
        block.className = `cal-shift${seg.isOverlap?' is-overlap':''}`;
        block.style.top = `${seg.startMin/60*ROW_H}px`;
        block.style.height = `${Math.max(20,(seg.endMin-seg.startMin)/60*ROW_H - 2)}px`;
        block.style.left = `calc(${left}% + 2px)`;
        block.style.width = `calc(${width}% - 4px)`;
        const color = getPersonColor(seg.shift.name);
        block.style.background = hexToRgba(color, 0.16);
        block.style.borderLeftColor = color;
        block.style.opacity = matchesSearch ? '1' : '0.28';
        const initials = seg.shift.name.trim().slice(0,1).toUpperCase();
        block.innerHTML = `
          <div class="cal-shift-top">
            <span class="cal-avatar" style="background:${color}">${initials}</span>
            <span class="cal-shift-name" style="color:${color}">${escapeHtml(seg.shift.name)}</span>
          </div>
          <div class="cal-shift-time">${minutesToTime(seg.startMin)}–${minutesToTime(seg.endMin)}</div>
          ${seg.shift.notes ? `<div class="cal-shift-note">${escapeHtml(seg.shift.notes)}</div>` : ''}
        `;
        block.title = `${seg.shift.name} · ${seg.shift.start}–${seg.shift.end} (${formatDurationLabel(shiftDuration(seg.shift.start, seg.shift.end))})${seg.shift.notes?' · '+seg.shift.notes:''}`;
        block.addEventListener('click', () => openShiftModal(seg.shift.id));
        col.appendChild(block);
      });

      // "bastão de revezamento" — indica transição direta entre dois plantões
      const sorted = day.segments.slice().sort((a,b)=>a.startMin-b.startMin);
      for (let k=0;k<sorted.length-1;k++){
        if (sorted[k].endMin === sorted[k+1].startMin && sorted[k].shift.id !== sorted[k+1].shift.id){
          const dot = makeDiv('cal-handoff');
          dot.style.top = `${sorted[k].endMin/60*ROW_H}px`;
          dot.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 18 10 8M20 6l-6 10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>`;
          dot.title = `Troca: ${sorted[k].shift.name} → ${sorted[k+1].shift.name}`;
          col.appendChild(dot);
        }
      }

      // linha do "agora"
      if (isToday){
        const nowMin = now.getHours()*60 + now.getMinutes();
        const line = makeDiv('cal-now-line');
        line.style.top = `${nowMin/60*ROW_H}px`;
        col.appendChild(line);
      }

      grid.appendChild(col);
    });
  }

  function makeDiv(cls){ const d = document.createElement('div'); d.className = cls; return d; }

  function hexToRgba(hex, alpha){
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ---------------------------------------------------------------------
   * 6. RESUMO E ALERTAS
   * ------------------------------------------------------------------- */
  function renderSummary(weekDays, weekData){
    const now = new Date();

    // quem está agora
    const current = state.shifts.find(s => now >= shiftStartDateTime(s) && now < shiftEndDateTime(s));
    const cardAgora = el('cardAgora');
    if (current){
      cardAgora.classList.remove('is-empty');
      el('valAgora').textContent = current.name;
      el('subAgora').textContent = `até ${current.end} · ${formatDurationLabel(shiftDuration(current.start,current.end))} de plantão`;
    } else {
      cardAgora.classList.add('is-empty');
      el('valAgora').textContent = 'Ninguém no momento';
      el('subAgora').textContent = 'nenhum plantão cobre este horário';
    }

    // próximo
    const upcoming = state.shifts
      .map(s => ({ s, start: shiftStartDateTime(s) }))
      .filter(x => x.start > now)
      .sort((a,b) => a.start - b.start)[0];
    if (upcoming){
      el('valProximo').textContent = upcoming.s.name;
      const sameDay = toDateKey(upcoming.start) === toDateKey(now);
      el('subProximo').textContent = `${sameDay ? 'hoje' : DOW_LONG[upcoming.start.getDay()].toLowerCase()} às ${upcoming.s.start}`;
    } else {
      el('valProximo').textContent = 'Nenhum plantão futuro';
      el('subProximo').textContent = 'cadastre um novo plantão';
    }

    // lacunas na semana exibida
    const totalGapMinutes = weekData.reduce((acc,d) => acc + d.gaps.reduce((a,g)=>a+(g.end-g.start),0), 0);
    const gapCount = weekData.reduce((acc,d) => acc + d.gaps.length, 0);
    el('valLacunas').textContent = gapCount === 0 ? 'Semana coberta' : `${gapCount} período${gapCount>1?'s':''}`;
    el('cardLacunas').classList.toggle('summary-card--gap', gapCount>0);

    // horas por pessoa (plantões cuja data de início cai na semana exibida)
    const weekKeys = new Set(weekDays.map(toDateKey));
    const hoursByPerson = {};
    state.shifts.filter(s => weekKeys.has(s.date)).forEach(s => {
      const dur = shiftDuration(s.start, s.end);
      hoursByPerson[s.name] = (hoursByPerson[s.name]||0) + dur;
    });
    const listaHoras = el('listaHoras');
    const entries = Object.entries(hoursByPerson).sort((a,b)=>b[1]-a[1]);
    if (!entries.length){
      listaHoras.innerHTML = `<span class="summary-card-sub">Sem plantões nesta semana</span>`;
    } else {
      listaHoras.innerHTML = entries.map(([name,min]) => `
        <div class="hours-row">
          <span class="hours-dot" style="background:${getPersonColor(name)}"></span>
          ${escapeHtml(name)} <b>${(min/60).toFixed(1)}h</b>
        </div>`).join('');
    }
  }

  function renderAlerts(weekDays, weekData){
    const box = el('alertsBox');
    const gapItems = [];
    const overlapItems = [];

    weekData.forEach((day, i) => {
      const date = weekDays[i];
      day.gaps.forEach(g => {
        gapItems.push(`${DOW_LONG[date.getDay()]} ${minutesToTime(g.start)}–${minutesToTime(g.end)}`);
      });
      if (day.hasOverlap){
        const names = Array.from(new Set(day.segments.filter(s=>s.isOverlap).map(s=>s.shift.name)));
        overlapItems.push(`${DOW_LONG[date.getDay()]}: ${names.join(' e ')} têm horários sobrepostos`);
      }
    });

    let html = '';
    if (gapItems.length){
      const shown = gapItems.slice(0,4).join(' · ');
      const rest = gapItems.length>4 ? ` (+${gapItems.length-4} outros)` : '';
      html += `<div class="alert alert-danger"><svg class="icon" width="17" height="17"><use href="#icon-alert"/></svg><span><b>Sem acompanhante:</b> ${shown}${rest}</span></div>`;
    }
    if (overlapItems.length){
      const shown = overlapItems.slice(0,4).join(' · ');
      const rest = overlapItems.length>4 ? ` (+${overlapItems.length-4} outros)` : '';
      html += `<div class="alert alert-warning"><svg class="icon" width="17" height="17"><use href="#icon-alert"/></svg><span><b>Horários sobrepostos:</b> ${shown}${rest}</span></div>`;
    }
    box.innerHTML = html;
    box.hidden = !html;
  }

  /* ---------------------------------------------------------------------
   * 7. DISPONIBILIDADE
   * ------------------------------------------------------------------- */
  function renderAvailability(){
    const list = el('availList');
    if (!state.availability.length){
      list.innerHTML = `<p class="empty-state">Ninguém informou disponibilidade ainda.</p>`;
      return;
    }
    const sorted = state.availability.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    list.innerHTML = sorted.map(a => {
      const color = getPersonColor(a.name);
      const daysBadges = a.days.slice().sort().map(d => `<span class="avail-day-badge">${DOW_SHORT[d]}</span>`).join('');
      return `
      <div class="avail-card" data-id="${a.id}">
        <span class="avail-avatar" style="background:${color}">${escapeHtml(a.name.slice(0,1).toUpperCase())}</span>
        <div class="avail-body">
          <div class="avail-name">${escapeHtml(a.name)}</div>
          <div class="avail-days">${daysBadges || '<span class="summary-card-sub">nenhum dia marcado</span>'}</div>
          <div class="avail-time"><svg class="icon" width="14" height="14"><use href="#icon-clock"/></svg> ${a.start} às ${a.end}</div>
          ${a.notes ? `<div class="avail-note">"${escapeHtml(a.notes)}"</div>` : ''}
        </div>
        <div class="avail-actions">
          <button class="icon-btn" title="Editar" data-action="edit-avail" data-id="${a.id}"><svg class="icon" width="15" height="15"><use href="#icon-edit"/></svg></button>
          <button class="icon-btn" title="Excluir" data-action="delete-avail" data-id="${a.id}"><svg class="icon" width="15" height="15"><use href="#icon-trash"/></svg></button>
        </div>
      </div>`;
    }).join('');
  }

  // Ordem de exibição das colunas (Segunda -> Domingo), usando o índice de getDay() (0=Domingo)
  const DOW_ORDER = [1,2,3,4,5,6,0];

  // Converte cada disponibilidade em segmentos por dia da semana (mesma lógica de "vira a noite" dos plantões)
  function availabilitySegments(){
    const segs = [];
    state.availability.forEach(a => {
      const startMin = timeToMinutes(a.start);
      let endMin = timeToMinutes(a.end);
      if (endMin <= startMin) endMin += 1440;
      (a.days||[]).forEach(day => {
        const fakeShift = { id: `${a.id}-${day}`, name: a.name, notes: a.notes };
        if (endMin <= 1440){
          segs.push({ day, startMin, endMin, shift: fakeShift });
        } else {
          segs.push({ day, startMin, endMin: 1440, shift: { ...fakeShift, id: fakeShift.id+'a' } });
          segs.push({ day: (day+1)%7, startMin: 0, endMin: endMin-1440, shift: { ...fakeShift, id: fakeShift.id+'b' } });
        }
      });
    });
    return segs;
  }

  function renderAvailabilityCalendar(){
    const grid = el('availCalendarGrid');
    if (!grid) return;
    const allSegs = availabilitySegments();
    renderLegend('legendaDisponibilidade', state.availability.map(a => a.name));
    grid.innerHTML = '';

    grid.appendChild(makeDiv('cal-corner'));
    DOW_ORDER.forEach(dow => {
      const header = makeDiv('cal-daycol-header');
      header.innerHTML = `<div class="dow">${DOW_LONG[dow]}</div>`;
      grid.appendChild(header);
    });

    grid.appendChild(buildHoursColumn());

    DOW_ORDER.forEach((dow, i) => {
      const segsForDay = allSegs.filter(s => s.day === dow);
      const day = computeDayData(String(dow), segsForDay);
      const col = makeDiv('cal-daycol');
      col.style.height = `${24*ROW_H}px`;
      col.style.gridColumn = String(i+2);
      col.style.gridRow = '2';

      // lacunas: ninguém disponível nesse horário
      day.gaps.forEach(g => {
        const gapEl = makeDiv('cal-gap');
        gapEl.style.top = `${g.start/60*ROW_H}px`;
        gapEl.style.height = `${Math.max(2,(g.end-g.start)/60*ROW_H)}px`;
        if ((g.end-g.start) >= 40){
          gapEl.innerHTML = `<div class="cal-gap-label">Ninguém disponível</div>`;
        }
        col.appendChild(gapEl);
      });

      day.segments.forEach(seg => {
        const width = 100/seg.totalCols;
        const left = seg.col*width;
        const block = document.createElement('div');
        block.className = `cal-shift${seg.isOverlap?' is-avail-overlap':''}`;
        block.style.top = `${seg.startMin/60*ROW_H}px`;
        block.style.height = `${Math.max(20,(seg.endMin-seg.startMin)/60*ROW_H - 2)}px`;
        block.style.left = `calc(${left}% + 2px)`;
        block.style.width = `calc(${width}% - 4px)`;
        const color = getPersonColor(seg.shift.name);
        block.style.background = hexToRgba(color, 0.16);
        block.style.borderLeftColor = color;
        const initials = seg.shift.name.trim().slice(0,1).toUpperCase();
        block.innerHTML = `
          <div class="cal-shift-top">
            <span class="cal-avatar" style="background:${color}">${initials}</span>
            <span class="cal-shift-name" style="color:${color}">${escapeHtml(seg.shift.name)}</span>
          </div>
          <div class="cal-shift-time">${minutesToTime(seg.startMin)}–${minutesToTime(seg.endMin)}</div>
          ${seg.shift.notes ? `<div class="cal-shift-note">${escapeHtml(seg.shift.notes)}</div>` : ''}
        `;
        block.title = `${seg.shift.name} · disponível ${minutesToTime(seg.startMin)}–${minutesToTime(seg.endMin)}${seg.shift.notes?' · '+seg.shift.notes:''}`;
        col.appendChild(block);
      });

      grid.appendChild(col);
    });
  }

  function renderNamesDatalist(){
    const names = new Set([
      ...state.shifts.map(s=>s.name),
      ...state.availability.map(a=>a.name)
    ]);
    el('listaNomes').innerHTML = Array.from(names).map(n => `<option value="${escapeHtml(n)}">`).join('');
  }

  /* ---------------------------------------------------------------------
   * 8. MODAIS — PLANTÃO
   * ------------------------------------------------------------------- */
  function openShiftModal(id){
    const form = el('formPlantao');
    form.reset();
    el('btnExcluirPlantao').hidden = true;
    el('plantaoId').value = '';
    el('dicaDuracao').textContent = '';

    if (id){
      const shift = state.shifts.find(s => s.id === id);
      if (!shift) return;
      el('modalPlantaoTitulo').textContent = 'Editar plantão';
      el('plantaoId').value = shift.id;
      el('plantaoNome').value = shift.name;
      el('plantaoData').value = shift.date;
      el('plantaoInicio').value = shift.start;
      el('plantaoFim').value = shift.end;
      el('plantaoObs').value = shift.notes || '';
      el('btnExcluirPlantao').hidden = false;
      updateDicaDuracao();
    } else {
      el('modalPlantaoTitulo').textContent = 'Novo plantão';
      el('plantaoData').value = toDateKey(new Date());
    }
    showModal('modalPlantao');
    el('plantaoNome').focus();
  }

  function updateDicaDuracao(){
    const ini = el('plantaoInicio').value, fim = el('plantaoFim').value;
    if (ini && fim){
      const dur = shiftDuration(ini, fim);
      const overnight = timeToMinutes(fim) <= timeToMinutes(ini);
      el('dicaDuracao').textContent = `Duração do plantão: ${formatDurationLabel(dur)}${overnight ? ' (vira a noite, termina no dia seguinte)' : ''}`;
    } else {
      el('dicaDuracao').textContent = '';
    }
  }

  function submitShiftForm(evt){
    evt.preventDefault();
    const id = el('plantaoId').value;
    const data = {
      name: el('plantaoNome').value.trim(),
      date: el('plantaoData').value,
      start: el('plantaoInicio').value,
      end: el('plantaoFim').value,
      notes: el('plantaoObs').value.trim()
    };
    if (!data.name || !data.date || !data.start || !data.end) return;

    if (id){
      const idx = state.shifts.findIndex(s => s.id === id);
      if (idx > -1) state.shifts[idx] = { ...state.shifts[idx], ...data };
      showToast('Plantão atualizado.');
    } else {
      state.shifts.push({ id: uid(), ...data });
      showToast('Plantão adicionado à agenda.');
    }
    getPersonColor(data.name);
    saveShifts();
    closeModal('modalPlantao');
    render();
  }

  function deleteShift(id){
    state.shifts = state.shifts.filter(s => s.id !== id);
    saveShifts();
    render();
    showToast('Plantão excluído.');
  }

  /* ---------------------------------------------------------------------
   * 9. MODAIS — DISPONIBILIDADE
   * ------------------------------------------------------------------- */
  function openAvailabilityModal(id){
    const form = el('formDisponibilidade');
    form.reset();
    form.dataset.editId = '';
    document.querySelectorAll('#dispDias input').forEach(cb => cb.checked = false);

    if (id){
      const a = state.availability.find(x => x.id === id);
      if (!a) return;
      form.dataset.editId = id;
      el('modalDispTitulo').textContent = 'Editar disponibilidade';
      el('dispNome').value = a.name;
      el('dispInicio').value = a.start;
      el('dispFim').value = a.end;
      el('dispObs').value = a.notes || '';
      document.querySelectorAll('#dispDias input').forEach(cb => { cb.checked = a.days.includes(Number(cb.value)); });
    } else {
      el('modalDispTitulo').textContent = 'Informar disponibilidade';
    }
    showModal('modalDisponibilidade');
    el('dispNome').focus();
  }

  function submitAvailabilityForm(evt){
    evt.preventDefault();
    const editId = el('formDisponibilidade').dataset.editId;
    const days = Array.from(document.querySelectorAll('#dispDias input:checked')).map(cb => Number(cb.value));
    const data = {
      name: el('dispNome').value.trim(),
      days,
      start: el('dispInicio').value,
      end: el('dispFim').value,
      notes: el('dispObs').value.trim()
    };
    if (!data.name || !data.start || !data.end || !days.length) {
      showToast('Selecione ao menos um dia disponível.');
      return;
    }

    if (editId){
      const idx = state.availability.findIndex(a => a.id === editId);
      if (idx>-1) state.availability[idx] = { ...state.availability[idx], ...data };
      showToast('Disponibilidade atualizada.');
    } else {
      state.availability.push({ id: uid(), ...data });
      showToast('Disponibilidade registrada. Obrigado!');
    }
    getPersonColor(data.name);
    saveAvailability();
    closeModal('modalDisponibilidade');
    render();
  }

  function deleteAvailability(id){
    state.availability = state.availability.filter(a => a.id !== id);
    saveAvailability();
    render();
    showToast('Disponibilidade removida.');
  }

  /* ---------------------------------------------------------------------
   * 10. MODAIS — helpers genéricos + confirmação + toast
   * ------------------------------------------------------------------- */
  function showModal(id){ el(id).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal(id){ el(id).hidden = true; document.body.style.overflow = ''; }

  function askConfirm(text, onConfirm){
    el('confirmTexto').textContent = text;
    showModal('modalConfirm');
    const okBtn = el('confirmOk');
    const handler = () => { onConfirm(); cleanup(); };
    const cancelHandler = () => cleanup();
    function cleanup(){
      okBtn.removeEventListener('click', handler);
      el('confirmCancelar').removeEventListener('click', cancelHandler);
      closeModal('modalConfirm');
    }
    okBtn.addEventListener('click', handler);
    el('confirmCancelar').addEventListener('click', cancelHandler);
  }

  let toastTimer;
  function showToast(msg){
    const t = el('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ---------------------------------------------------------------------
   * 11. EXPORTAÇÃO — PDF, Excel, Impressão
   * ------------------------------------------------------------------- */
  function getSortedShiftsForExport(){
    return state.shifts.slice().sort((a,b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  }

  function exportPdf(){
    if (!window.jspdf){ showToast('Biblioteca de PDF ainda carregando, tente novamente em instantes.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(15);
    doc.text('Escala da Família — Acompanhamento Hospitalar', 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 22);

    const rows = getSortedShiftsForExport().map(s => [
      s.name,
      parseDateKey(s.date).toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' }),
      s.start, s.end,
      formatDurationLabel(shiftDuration(s.start, s.end)),
      s.notes || ''
    ]);

    doc.autoTable({
      startY: 28,
      head: [['Acompanhante','Data','Início','Término','Duração','Observações']],
      body: rows,
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: [47,111,107] },
      alternateRowStyles: { fillColor: [251,248,241] }
    });

    doc.save('escala-acompanhantes.pdf');
    showToast('PDF exportado.');
  }

  function exportXlsx(){
    if (!window.XLSX){ showToast('Biblioteca de Excel ainda carregando, tente novamente em instantes.'); return; }
    const rows = getSortedShiftsForExport().map(s => ({
      Acompanhante: s.name,
      Data: s.date,
      Início: s.start,
      Término: s.end,
      'Duração (min)': shiftDuration(s.start, s.end),
      Observações: s.notes || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:18},{wch:12},{wch:8},{wch:9},{wch:14},{wch:32}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Escala');
    XLSX.writeFile(wb, 'escala-acompanhantes.xlsx');
    showToast('Excel exportado.');
  }

  /* ---------------------------------------------------------------------
   * 12. EVENTOS
   * ------------------------------------------------------------------- */
  function bindEvents(){
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.dataset.tabpanel !== tab; });
      });
    });

    el('btnSemanaAnterior').addEventListener('click', () => { state.weekStart = addDays(state.weekStart, -7); render(); });
    el('btnSemanaProxima').addEventListener('click', () => { state.weekStart = addDays(state.weekStart, 7); render(); });
    el('btnHoje').addEventListener('click', () => { state.weekStart = getMonday(new Date()); render(); });

    el('inputBusca').addEventListener('input', (e) => { state.search = e.target.value.trim().toLowerCase(); renderCalendarOnly(); });
    el('selectDia').addEventListener('change', (e) => { state.dayFilter = e.target.value; renderCalendarOnly(); });

    el('btnNovoPlantao').addEventListener('click', () => openShiftModal(null));
    el('fecharModalPlantao').addEventListener('click', () => closeModal('modalPlantao'));
    el('cancelarPlantao').addEventListener('click', () => closeModal('modalPlantao'));
    el('formPlantao').addEventListener('submit', submitShiftForm);
    el('plantaoInicio').addEventListener('change', updateDicaDuracao);
    el('plantaoFim').addEventListener('change', updateDicaDuracao);
    el('btnExcluirPlantao').addEventListener('click', () => {
      const id = el('plantaoId').value;
      closeModal('modalPlantao');
      askConfirm('Tem certeza que deseja excluir este plantão? Essa ação não pode ser desfeita.', () => deleteShift(id));
    });

    el('btnNovaDisponibilidade').addEventListener('click', () => openAvailabilityModal(null));
    el('fecharModalDisp').addEventListener('click', () => closeModal('modalDisponibilidade'));
    el('cancelarDisp').addEventListener('click', () => closeModal('modalDisponibilidade'));
    el('formDisponibilidade').addEventListener('submit', submitAvailabilityForm);

    el('availList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit-avail') openAvailabilityModal(id);
      if (btn.dataset.action === 'delete-avail'){
        askConfirm('Remover esta disponibilidade da lista?', () => deleteAvailability(id));
      }
    });

    // fechar modais clicando fora ou com ESC
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay.id); });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape'){
        document.querySelectorAll('.modal-overlay').forEach(o => { if (!o.hidden) closeModal(o.id); });
      }
    });

    el('btnPrint').addEventListener('click', () => window.print());
    el('btnExportPdf').addEventListener('click', exportPdf);
    el('btnExportXlsx').addEventListener('click', exportXlsx);
  }

  // pequena otimização: filtros de busca/dia só precisam re-render a agenda
  function renderCalendarOnly(){
    const weekDays = getWeekDays(state.weekStart);
    const weekData = computeWeekData(weekDays);
    renderCalendar(weekDays, weekData);
  }

  /* ---------------------------------------------------------------------
   * 13. INICIALIZAÇÃO
   * ------------------------------------------------------------------- */
  function init(){
    loadAll();
    seedDemoDataIfEmpty();
    loadAll(); // recarrega caso o seed tenha populado agora
    bindEvents();
    render();
    // atualiza a linha do "agora" e o resumo a cada minuto
    setInterval(render, 60*1000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
