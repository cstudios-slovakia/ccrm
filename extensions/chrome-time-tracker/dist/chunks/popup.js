import{b as e,d as t,f as n,g as r,h as i,i as a,l as o,m as s,p as c,r as l,s as u,u as d,v as f,y as p}from"./presence.js";var m=1e4;function h(e){let t=Array.isArray(e?.running)?e.running:e?.entry?.running?[e.entry]:[],n=Array.isArray(e?.paused)?e.paused:[];return JSON.stringify([t.map(e=>[e?.id??``,e?.startAt??``,e?.title??``,e?.projectName??``,e?.taskId??``]),n.map(e=>e?.id??``),e?.presence?.phase??null,e?.presence?.deadlineAt??null])}var g=document.querySelector(`#app`),_=g?.dataset?.mode===`alert`,v=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]||e),y,b,x=``,S=!1,C=!1,w=null,T=`switch`,E=`time`,D=`mine`,O=``,k=[],A=new Set([`tomorrow`,`upcoming`]),ee=!1,j=``,M=!1,N=!1,P=e=>e.split(/\s+/).filter(Boolean).slice(0,2).map(e=>e[0].toUpperCase()).join(``),F=`<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"/></svg>`,te=`<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2.2" y="2" width="2.6" height="8" rx="0.8" fill="currentColor"/><rect x="7.2" y="2" width="2.6" height="8" rx="0.8" fill="currentColor"/></svg>`,I=`<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"/></svg>`,ne=`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M9.4 1.6a1.4 1.4 0 0 0-2.8 0l-.2.9a5.2 5.2 0 0 0-1.2.7l-.9-.3a1.4 1.4 0 0 0-1.4 2.4l.7.6a5.4 5.4 0 0 0 0 1.4l-.7.6a1.4 1.4 0 0 0 1.4 2.4l.9-.3c.4.3.8.5 1.2.7l.2.9a1.4 1.4 0 0 0 2.8 0l.2-.9c.4-.2.8-.4 1.2-.7l.9.3a1.4 1.4 0 0 0 1.4-2.4l-.7-.6a5.4 5.4 0 0 0 0-1.4l.7-.6a1.4 1.4 0 0 0-1.4-2.4l-.9.3a5.2 5.2 0 0 0-1.2-.7l-.2-.9zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>`,L=`<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M11.8 2.2a1.4 1.4 0 0 1 2 2L5.7 12.3 2.5 13l.7-3.2 8.6-7.6z"/></svg>`,R=()=>({parallelAllowed:!1,maxParallel:4,sameProject:`differentTasks`,presenceMinutes:50}),re=e=>({presence:null,paused:[],offsetMs:0,ccrmUrl:e,capabilities:R(),testAlertUntil:null});function z(e,r=!0){let i=e===null?``:`<span class="muted">${v(t(`Today`,`Dnes`,`Ma`))} ${v(p(e))}</span>`,a=P(x)?`<span class="avatar" title="${v(x)}">${v(P(x))}</span>`:``,o=r?`<button id="toggle-settings" class="icon-btn ${S?`active`:``}" type="button" title="${v(t(`Extension settings`,`Nastavenia rozšírenia`,`Bővítmény beállítások`))}" aria-label="${v(t(`Settings`,`Nastavenia`,`Beállítások`))}">${ne}</button>`:``;return`<div class="head"><strong class="brand">${v(n)}</strong><span class="head-end">${i}${a}${o}</span></div>`}function B(e){try{let t=new URL(e.includes(`://`)?e:`https://${e}`);return t.protocol!==`https:`&&t.protocol!==`http:`?null:t.origin}catch{return null}}function ie(){let e=navigator.userAgent;return/Windows/.test(e)?`Windows`:/Mac/.test(e)?`macOS`:/Linux/.test(e)?`Linux`:`Unknown`}async function V(){try{await chrome.runtime.sendMessage({type:`refresh`})}catch{}}async function H(e,t){let n=await c();await s({queue:[...n.queue,{...e,id:crypto.randomUUID()}].slice(-50),optimistic:t}),await V()}function ae(e,r){return`<div class="footer">${`<a href="${v(r)}/#time-tracking" target="_blank" rel="noreferrer">${v(t(`Open ${n}`,`Otvoriť ${n}`,`${n} megnyitása`))}</a>`}${e>0?`<span class="unsorted">${v(e)} ${v(t(`unsorted`,`nezaradené`,`rendezetlen`))}</span>`:`<span></span>`}</div>`}function U(e=``){window.clearInterval(y),window.clearInterval(b),g.innerHTML=`
    ${z(null,!1)}
    <div class="body stack">
      <h1>${v(t(`Connect to ${n}`,`Pripojiť k ${n}`,`Csatlakozás: ${n}`))}</h1>
      <label>${v(t(`${n} address`,`Adresa ${n}`,`${n} címe`))}
        <div class="row">
          <input id="url" placeholder="https://crm.example.com" autocomplete="url" />
          <button id="use-tab" class="tiny" type="button" title="${v(t(`Use open tab URL`,`Použiť URL otvorenej karty`,`Aktuális fül címe`))}">${v(t(`Tab`,`Karta`,`Fül`))}</button>
        </div>
      </label>
      <label>${v(t(`Pairing code`,`Párovací kód`,`Párosítási kód`))}<input id="code" class="mono" placeholder="K7Q4-9MZT" autocapitalize="characters" /></label>
      ${e?`<p class="error">${v(e)}</p>`:``}
      <button id="connect" class="primary wide" type="button">${v(t(`Connect`,`Pripojiť`,`Csatlakozás`))}</button>
      <p class="muted">${v(t(`Get a one-time pairing code in ${n} under Time tracking → Chrome extension (or Settings → Time tracking).`,`Jednorazový párovací kód získate v ${n} v Evidencia času → Rozšírenie Chrome (alebo Nastavenia → Evidencia času).`,`Az egyszer használatos kódot a ${n} Időkövetés → Chrome-bővítmény alatt (vagy a Beállításokban) találja.`))}</p>
    </div>`,c().then(e=>{let t=g.querySelector(`#url`);e.ccrmUrl&&(t.value=e.ccrmUrl)}),g.querySelector(`#use-tab`)?.addEventListener(`click`,async()=>{try{if(!await chrome.permissions.request({permissions:[`tabs`]}))return;let e=B((await chrome.tabs.query({active:!0,currentWindow:!0}))?.[0]?.url||``);e&&(g.querySelector(`#url`).value=e)}catch{}}),g.querySelector(`#connect`)?.addEventListener(`click`,()=>void oe())}async function oe(){let e=B(g.querySelector(`#url`).value.trim()),a=g.querySelector(`#code`).value.trim();if(!e){U(t(`Enter a full ${n} address.`,`Zadajte celú adresu ${n}.`,`Adja meg a ${n} teljes címét.`));return}let o=g.querySelector(`#connect`);o.disabled=!0;try{if(!await chrome.permissions.request({origins:[`${e}/*`]})){U(t(`Chrome needs permission to reach that address.`,`Chrome potrebuje povolenie na prístup k tejto adrese.`,`A Chrome-nak engedély kell a cím eléréséhez.`));return}let n=await r(e,``,`POST`,`pair`,{code:a,deviceName:`Chrome on ${ie()}`,browser:`Chrome`,os:ie(),version:f});await s({ccrmUrl:e,deviceKey:n.deviceKey,userName:n.user?.name||``,queue:[],optimistic:null}),await V(),await W()}catch(e){let t=e instanceof i?e.code:`offline`;U(d(t===`not_paired`?`code_invalid`:t))}}async function W(){let e=await c();if(x=e.userName||``,e.prefs.defaultStartMode===`parallel`&&(T=`parallel`),!e.deviceKey||!e.ccrmUrl)S=!1,U(e.lost.length?t(`This browser is not paired. The actions below were not saved.`,`Tento prehliadač nie je spárovaný. Akcie nižšie neboli uložené.`,`Ez a böngésző nincs párosítva. Az alábbi műveletek nem lettek mentve.`):``),e.lost.length&&G(e.lost);else if(S){let t={enabled:!1};try{t=await r(e.ccrmUrl,e.deviceKey,`GET`,`rules`)}catch{}se(e,!!t.enabled)}else try{let[t,n,i,a,o]=await Promise.all([r(e.ccrmUrl,e.deviceKey,`GET`,`running`),r(e.ccrmUrl,e.deviceKey,`GET`,`recent`),r(e.ccrmUrl,e.deviceKey,`GET`,`unsortedCount`),r(e.ccrmUrl,e.deviceKey,`GET`,`rules`),r(e.ccrmUrl,e.deviceKey,`GET`,`myTasks`,{},{}).catch(()=>({tasks:[]}))]);k=Array.isArray(o?.tasks)?o.tasks:[],j=h(t);let s=e.optimistic?[{id:``,running:!0,title:e.optimistic.title,projectName:e.optimistic.projectName,startAt:e.optimistic.startedAt,taskId:e.optimistic.taskTitle?`local`:null,titleSource:`entry`,billable:!0}]:Array.isArray(t.running)&&t.running.length>0?t.running:t.entry?.running?[t.entry]:[],c=t.capabilities&&typeof t.capabilities==`object`?{parallelAllowed:!!t.capabilities.parallelAllowed,maxParallel:Number(t.capabilities.maxParallel)||4,sameProject:String(t.capabilities.sameProject||`differentTasks`),presenceMinutes:Number(t.capabilities.presenceMinutes)||50}:R();c.parallelAllowed||(T=`switch`);let l={presence:t.presence&&typeof t.presence.phase==`string`?t.presence:null,paused:Array.isArray(t.paused)?t.paused:[],offsetMs:u(t.serverNow),ccrmUrl:e.ccrmUrl,capabilities:c,testAlertUntil:e.testAlertUntil};K({items:s,workedTodaySeconds:Number(t.workedTodaySeconds??n.todaySeconds??0),recent:n.entries||[],unsorted:i.count||0,rulesEnabled:!!a.enabled,ccrmUrl:e.ccrmUrl,offline:!1,extras:l})}catch(r){if(r instanceof i&&r.code===`not_paired`){let e=(await c()).lost;x=``,await s({deviceKey:``,userName:``,optimistic:null,snapshot:null}),U(t(`This browser was revoked. Pair it again.`,`Tomuto prehliadaču bol prístup odobratý. Spárujte ho znova.`,`Ennek a böngészőnek a hozzáférését visszavonták. Párosítsa újra.`)),e.length&&G(e);return}if(r instanceof i&&r.code===`offline`){K({items:e.optimistic?[{id:``,running:!0,title:e.optimistic.title,projectName:e.optimistic.projectName,startAt:e.optimistic.startedAt,titleSource:`entry`,billable:!0}]:[],workedTodaySeconds:0,recent:[],unsorted:0,rulesEnabled:!1,ccrmUrl:e.ccrmUrl,offline:!0,extras:re(e.ccrmUrl)});return}U(r instanceof i?d(r.code):t(`Could not reach ${n}.`,`${n} nie je dostupný.`,`A ${n} nem érhető el.`))}}function se(e,n){window.clearInterval(y),window.clearInterval(b);let{prefs:i,testAlertUntil:a,ccrmUrl:o}=e,c=!!(a&&a>Date.now());g.innerHTML=`
    ${z(null)}
    <div class="body stack">
      <div class="spread">
        <h1>${v(t(`Extension settings`,`Nastavenia rozšírenia`,`Bővítmény beállítások`))}</h1>
        <button id="back-tracker" class="tiny" type="button">${v(t(`Back`,`Späť`,`Vissza`))}</button>
      </div>
      <div class="card stack">
        <span class="section-label">${v(t(`50-minute check-in alert`,`50-minútové upozornenie`,`50 perces ellenőrzés`))}</span>
        <label class="check"><input id="pref-flash" type="checkbox" ${i.flashWindow?`checked`:``} /> ${v(t(`Pulse icon & flash Chrome taskbar/dock`,`Pulzovať ikonu a blikať okno Chrome`,`Ikon és Chrome tálca/dock villogtatása`))}</label>
        <label class="check"><input id="pref-sound" type="checkbox" ${i.soundEnabled?`checked`:``} /> ${v(t(`Play two-tone chime`,`Prehrať zvukový signál`,`Hangjelzés lejátszása`))}</label>
        <label>${v(t(`Chime volume`,`Hlasitosť signálu`,`Hangerő`))}
          <input id="pref-vol" type="range" min="10" max="100" value="${Math.round((i.soundVolume??.7)*100)}" />
        </label>
        <label class="check"><input id="pref-popout" type="checkbox" ${i.autoPopoutAlert?`checked`:``} /> ${v(t(`Auto-open mini confirmation window at 50 min`,`Automaticky otvoriť mini okno po 50 min`,`Mini megerősítő ablak automatikus megnyitása 50 perc után`))}</label>
        <div class="row">
          <button id="test-alert" class="${c?`tiny danger wide`:`tiny wide`}" type="button">
            ${v(c?t(`Stop pulse test`,`Zastaviť test pulzu`,`Teszt leállítása`):t(`Test 50-min pulse alert (10s)`,`Otestovať 50-min pulz (10s)`,`50 perces pulzus teszt (10 mp)`))}
          </button>
        </div>
      </div>

      <div class="card stack">
        <span class="section-label">${v(t(`Timers & Shortcuts`,`Časovače a skratky`,`Időzítők és billentyűparancsok`))}</span>
        <label>${v(t(`Default when another timer runs`,`Predvolené pri bežiacom časovači`,`Alapértelmezett mód futó időzítő esetén`))}
          <select id="pref-mode">
            <option value="switch" ${i.defaultStartMode===`switch`?`selected`:``}>${v(t(`Switch (stop previous)`,`Prepnúť (zastaviť predchádzajúci)`,`Váltás (előző leállítása)`))}</option>
            <option value="parallel" ${i.defaultStartMode===`parallel`?`selected`:``}>${v(t(`Run in parallel (if allowed)`,`Spustiť paralelne (ak je povolené)`,`Párhuzamos indítás (ha engedélyezett)`))}</option>
          </select>
        </label>
        <label class="check"><input id="pref-capture" type="checkbox" ${n?`checked`:``} /> ${v(t(`Remember watched sites when idle`,`Sledovať vybrané stránky bez časovača`,`Figyelt oldalak rögzítése üresjáratban`))}</label>
        <p class="muted">${v(t(`Shortcuts: Alt+Shift+T (open), Alt+Shift+S (confirm / pause). Right-click any page to start tracking it.`,`Skratky: Alt+Shift+T (otvoriť), Alt+Shift+S (potvrdiť / pozastaviť). Pravým klikom na stránke spustíte meranie.`,`Parancsok: Alt+Shift+T (megnyitás), Alt+Shift+S (megerősítés / szünet). Jobb kattintással bármely oldal mérhető.`))}</p>
      </div>

      <div class="card stack">
        <span class="section-label">${v(t(`Connection`,`Pripojenie`,`Kapcsolat`))}</span>
        <div class="muted">${v(o)} · v${v(f)}</div>
        <button id="unpair" class="tiny danger wide" type="button">${v(t(`Disconnect browser`,`Odpojiť prehliadač`,`Böngésző leválasztása`))}</button>
      </div>
    </div>`,g.querySelector(`#toggle-settings`)?.addEventListener(`click`,()=>{S=!1,W()}),g.querySelector(`#back-tracker`)?.addEventListener(`click`,()=>{S=!1,W()});let l=async t=>{await s({prefs:{...e.prefs,...t}}),await chrome.runtime.sendMessage({type:`prefs-updated`}).catch(()=>{})};g.querySelector(`#pref-flash`)?.addEventListener(`change`,e=>void l({flashWindow:e.target.checked})),g.querySelector(`#pref-sound`)?.addEventListener(`change`,e=>void l({soundEnabled:e.target.checked})),g.querySelector(`#pref-vol`)?.addEventListener(`change`,e=>void l({soundVolume:Number(e.target.value)/100})),g.querySelector(`#pref-popout`)?.addEventListener(`change`,e=>void l({autoPopoutAlert:e.target.checked})),g.querySelector(`#pref-mode`)?.addEventListener(`change`,e=>{let t=e.target.value===`parallel`?`parallel`:`switch`;T=t,l({defaultStartMode:t})}),g.querySelector(`#pref-capture`)?.addEventListener(`change`,async t=>{let n=t.target,i=n.checked;if(i&&!await chrome.permissions.request({permissions:[`tabs`]}))n.checked=!1;else try{await r(e.ccrmUrl,e.deviceKey,`POST`,`capture`,{enabled:i})}catch{n.checked=!i}}),g.querySelector(`#test-alert`)?.addEventListener(`click`,async()=>{await chrome.runtime.sendMessage({type:c?`stop-test-alert`:`test-alert`}),await W()}),g.querySelector(`#unpair`)?.addEventListener(`click`,async()=>{await s({deviceKey:``,userName:``,queue:[],optimistic:null,snapshot:null,testAlertUntil:null}),x=``,S=!1,await V(),U()})}function G(e){let n=e.map(e=>`<li>${v(e.kind)} · ${v(new Date(e.at).toLocaleString())}</li>`).join(``);g.insertAdjacentHTML(`beforeend`,`<div class="amber" style="margin-top:8px"><strong>${v(t(`Not sent`,`Neodoslané`,`Nem elküldve`))}</strong><ul>${n}</ul><button id="clear-lost" class="tiny" type="button">${v(t(`Dismiss`,`Zavrieť`,`Elvetés`))}</button></div>`),g.querySelector(`#clear-lost`)?.addEventListener(`click`,()=>{s({lost:[]}).then(()=>W())})}function K(e){let{items:n,workedTodaySeconds:r,recent:i,unsorted:a,ccrmUrl:o,offline:s,extras:c}=e,u=Date.now();M=!1;let d=n.length,f=d===0||C,p=d===1?r+(Number.isFinite(Date.parse(n[0].startAt))?Math.max(0,Math.floor((Date.now()-Date.parse(n[0].startAt))/1e3)):0):r,m=d===1?n[0]:null,h=m?[m.projectName,m.taskId&&m.titleSource!==`entry`?m.title:``].filter(Boolean).join(` · `):``,b=m?`
      <div class="running-band">
        <div class="grow">
          <h1>${v(m.title||t(`Running`,`Beží`,`Fut`))}</h1>
          <p class="project-line"><span class="dot"></span>${v(h||t(`Unsorted (no project yet)`,`Nezaradené (zatiaľ bez projektu)`,`Rendezetlen (még nincs projekt)`))}</p>
          <div class="row" style="margin-top:4px">
            <span class="elapsed item-elapsed" data-start="${v(m.startAt)}" style="margin:0;font-size:28px">0:00:00</span>
            <span class="pill ${m.billable?`billable-on`:`billable-off`}">${m.billable?v(t(`Billable`,`Fakturovateľné`,`Számlázható`)):v(t(`Non-billable`,`Nefakturovateľné`,`Nem számlázható`))}</span>
          </div>
          ${w===m.id?Y(m):``}
        </div>
        <div class="stack" style="gap:6px">
          <div class="row" style="gap:6px">
            ${m.id?`<button class="round small pause pause-item" type="button" data-id="${v(m.id)}" title="${v(t(`Pause`,`Pozastaviť`,`Szünet`))}">${te}</button>`:``}
            <button class="round stop stop-item" type="button" data-id="${v(m.id||``)}" title="${v(t(`Stop`,`Zastaviť`,`Leállítás`))}">${I}</button>
          </div>
          ${m.id?`<button class="tiny edit-toggle" type="button" data-id="${v(m.id)}">${L} ${v(t(`Edit`,`Upraviť`,`Szerk.`))}</button>`:``}
        </div>
      </div>`:d>1?`
        <div class="body stack" style="padding-bottom:0">
          <div class="spread">
            <h1>${v(d)} ${v(t(`timers running`,`bežiacich časovačov`,`futó időzítő`))}</h1>
            <span><span class="muted">${v(t(`Worked today`,`Odpracované dnes`,`Ma dolgozott`))}</span> <strong id="worked">${v(l(r))}</strong></span>
          </div>
          ${n.map(e=>`
            <div class="card">
              <div class="spread">
                <span class="grow">
                  <strong>${v(e.title||t(`Untitled`,`Bez názvu`,`Névtelen`))}</strong>
                  <br /><span class="muted">${v(e.projectName||t(`Unsorted`,`Nezaradené`,`Rendezetlen`))}</span>
                </span>
                <span class="item-elapsed" data-start="${v(e.startAt)}">0:00:00</span>
                <button class="round small soft edit-toggle" type="button" data-id="${v(e.id)}" title="${v(t(`Edit`,`Upraviť`,`Szerkesztés`))}">${L}</button>
                <button class="round small pause pause-item" type="button" data-id="${v(e.id)}" title="${v(t(`Pause`,`Pozastaviť`,`Szünet`))}">${te}</button>
                <button class="round small stop stop-item" type="button" data-id="${v(e.id)}" title="${v(t(`Stop`,`Zastaviť`,`Leállítás`))}">${I}</button>
              </div>
              ${w===e.id?Y(e):``}
            </div>`).join(``)}
        </div>`:``,x=d>0&&c.capabilities.parallelAllowed?`
      <div class="segmented" role="group" aria-label="${v(t(`Start mode`,`Režim spustenia`,`Indítási mód`))}">
        <button id="mode-switch" class="seg-btn ${T===`switch`?`active`:``}" type="button">${v(t(`Switch active`,`Prepnúť aktívny`,`Aktív cseréje`))}</button>
        <button id="mode-parallel" class="seg-btn ${T===`parallel`?`active`:``}" type="button">${v(t(`Run in parallel`,`Spustiť paralelne`,`Párhuzamosan`))}</button>
      </div>`:``,D=f?`
      <div class="card stack" style="background:#f8fafc">
        <div class="spread">
          <span class="section-label">${v(d>0?t(`Start another timer`,`Spustiť ďalší časovač`,`Új időzítő indítása`):t(`What are you working on?`,`Na čom pracuješ?`,`Min dolgozik?`))}</span>
          ${d>0?`<button id="close-start" class="tiny" type="button">${v(t(`Hide`,`Skryť`,`Elrejtés`))}</button>`:``}
        </div>
        ${x}
        <input id="title" aria-label="${v(t(`Search my tasks or type description`,`Hľadať úlohy alebo napísať popis`,`Feladat keresése vagy leírás`))}" placeholder="${v(t(`Search open tasks or type description…`,`Hľadať úlohu alebo napísať popis…`,`Nyitott feladat keresése vagy leírás…`))}" autocomplete="off" />
        <div id="task-picked" class="muted" hidden></div>
        <div id="task-list" class="picker"></div>
        <input id="project" aria-label="${v(t(`Project (optional)`,`Projekt (voliteľné)`,`Projekt (opcionális)`))}" placeholder="${v(t(`Filter or attach project (optional)…`,`Projekt (voliteľné)…`,`Projekt hozzáadása (opcionális)…`))}" autocomplete="off" />
        <div id="project-list" class="picker"></div>
        <p id="form-error" class="error" hidden></p>
        <button id="start" class="primary wide" type="button">${F} ${v(d>0&&T===`parallel`?t(`Start in parallel`,`Spustiť paralelne`,`Indítás párhuzamosan`):t(`Start timer`,`Spustiť časovač`,`Időzítő indítása`))}</button>
      </div>`:`<button id="open-start" class="tiny wide" type="button">${F} ${v(t(`Start / add another timer`,`Spustiť / pridať ďalší časovač`,`Új / párhuzamos időzítő indítása`))}</button>`,O=_?`time`:E;g.innerHTML=`
    ${z(p)}
    ${_?``:ce(d)}
    ${pe(d,c)}
    ${s?`<p class="amber note">${v(t(`Offline. Changes queue until back online.`,`Offline. Zmeny sa odošlú po pripojení.`,`Offline. A módosítások sorba állnak.`))}</p>`:``}
    <div id="notice" class="notice note"></div>
    ${X(c)?`<div class="body" style="padding-bottom:0">${X(c)}</div>`:``}
    ${O===`tasks`?`${de(n,o,c)}`:`${b}
        <div class="body stack">
          ${me(c)}
          ${D}
          ${xe(i)}
          ${ae(a,o)}
        </div>`}`;let k=()=>{let e=g.querySelector(`#worked`);e&&(e.textContent=l(r+(Date.now()-u)/1e3)),g.querySelectorAll(`.item-elapsed`).forEach(e=>{let t=Date.parse(e.dataset.start||``);Number.isFinite(t)&&(e.textContent=l((Date.now()+c.offsetMs-t)/1e3))})};k(),window.clearInterval(y),y=window.setInterval(k,1e3),g.querySelector(`#toggle-settings`)?.addEventListener(`click`,()=>{S=!0,W()}),g.querySelector(`#tab-time`)?.addEventListener(`click`,()=>{E!==`time`&&(E=`time`,K(e))}),g.querySelector(`#tab-tasks`)?.addEventListener(`click`,()=>{E!==`tasks`&&(E=`tasks`,K(e))}),g.querySelectorAll(`.stop-item`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.id||``,r=n.find(e=>String(e.id||``)===t)||n[0];r&&$(r)})}),g.querySelectorAll(`.pause-item`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.id||``;t&&_e(t)})}),g.querySelectorAll(`.edit-toggle`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.id||``;w=w===t?null:t,W()})}),g.querySelector(`#save-edit`)?.addEventListener(`click`,()=>{if(!w)return;let e=g.querySelector(`#edit-note`)?.value??``,t=!!g.querySelector(`#edit-billable`)?.checked,n=g.querySelector(`#edit-desc`);ve(w,{note:e,billable:t,...n?{description:n.value.trim()}:{}})}),g.querySelector(`#open-start`)?.addEventListener(`click`,()=>{C=!0,W()}),g.querySelector(`#close-start`)?.addEventListener(`click`,()=>{C=!1,W()}),g.querySelector(`#mode-switch`)?.addEventListener(`click`,()=>{T=`switch`,W()}),g.querySelector(`#mode-parallel`)?.addEventListener(`click`,()=>{T=`parallel`,W()}),O===`tasks`?fe(n,o):(f&&be(),Se(i)),he(c),Ce(o)}function ce(e){let n=k.filter(e=>e.mine).length,r=k.length;return`
    <div class="panel-tabs" role="tablist" aria-label="${v(t(`Panel section`,`Sekcia panela`,`Panel szakasz`))}">
      <button id="tab-time" class="panel-tab ${E===`time`?`active`:``}" type="button" role="tab" aria-selected="${E===`time`}">
        ${v(t(`Time`,`Čas`,`Idő`))}
        ${e>0?`<span class="tab-badge">${v(e)}</span>`:``}
      </button>
      <button id="tab-tasks" class="panel-tab ${E===`tasks`?`active`:``}" type="button" role="tab" aria-selected="${E===`tasks`}">
        ${v(t(`Tasks`,`Úlohy`,`Feladatok`))}
        ${r>0?`<span class="tab-badge">${v(D===`mine`?n:r)}</span>`:``}
      </button>
    </div>`}function le(){let e=O.trim().toLowerCase();return k.filter(t=>D===`mine`&&!t.mine?!1:!e||String(t.title||``).toLowerCase().includes(e)||String(t.projectName||``).toLowerCase().includes(e)||String(t.clientName||``).toLowerCase().includes(e)||String(t.status||``).toLowerCase().includes(e))}function q(e=0){let t=new Date(Date.now()+e*864e5);return`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,`0`)}-${String(t.getDate()).padStart(2,`0`)}`}function ue(e,n,r,i){let a=n.find(t=>String(t.taskId||``)===String(e.id||``)),o=String(e.deadline||``),s=!!(o&&o<i),c=String(e.priority||``)===`high`,l=[e.projectName||e.clientName,e.status].filter(Boolean),u=o?o.slice(5):``,d=[e.projectName,e.clientName,e.status,o].filter(Boolean).join(` · `);return`
    <div class="task-row ${a?`is-running`:``}">
      <div class="task-row-main">
        <div class="task-row-title" title="${v(e.title||``)}">
          ${c?`<span class="prio-dot" title="${v(t(`High priority`,`Vysoká priorita`,`Magas prioritás`))}"></span>`:``}
          <span class="task-row-title-text">${v(e.title||t(`Untitled task`,`Úloha bez názvu`,`Névtelen feladat`))}</span>
        </div>
        <div class="task-row-sub" title="${v(d)}">
          ${v(l.join(` · `))}${l.length&&u?` · `:``}${u?`<span class="${s?`overdue-text`:``}">${v(u)}</span>`:``}
        </div>
      </div>
      <div class="task-row-acts">
        ${a?`<span class="item-elapsed" data-start="${v(a.startAt)}">0:00:00</span>
             <button class="mini-btn stop stop-task-btn" type="button" data-id="${v(a.id)}" title="${v(t(`Stop`,`Zastaviť`,`Leállítás`))}">${I}</button>`:`<button class="mini-btn play start-task-btn" type="button" data-task-id="${v(e.id)}" data-project-id="${v(e.projectId||``)}" data-project-name="${v(e.projectName||``)}" data-title="${v(e.title||``)}" title="${v(t(`Start timer`,`Spustiť časovač`,`Időzítő indítása`))}">${F}</button>`}
        <a class="icon-link" href="${v(r)}/#tasks" target="_blank" rel="noopener" title="${v(t(`Open in CRM`,`Otvoriť v CRM`,`Megnyitás a CRM-ben`))}">↗</a>
      </div>
    </div>`}function J(e,n){let r=le();if(!r.length)return`<p class="muted" style="text-align:center;padding:12px 0">${v(t(`No matching open tasks.`,`Žiadne otvorené úlohy.`,`Nincs nyitott feladat.`))}</p>`;let i=q(0),a=q(1),o=[{key:`overdue`,label:t(`Overdue`,`Po termíne`,`Lejárt`),rows:[]},{key:`today`,label:t(`Today`,`Dnes`,`Ma`),rows:[]},{key:`tomorrow`,label:t(`Tomorrow`,`Zajtra`,`Holnap`),rows:[]},{key:`upcoming`,label:t(`Upcoming`,`Nadchádzajúce`,`Közelgő`),rows:[]}];for(let e of r){let t=String(e.deadline||``);t&&t<i?o[0].rows.push(e):t===i?o[1].rows.push(e):t===a?o[2].rows.push(e):o[3].rows.push(e)}let s=o.filter(e=>e.rows.length>0);!ee&&o[0].rows.length===0&&o[1].rows.length===0&&s.length>0&&A.delete(s[0].key);let c=O.trim().length>0;return s.map(t=>{let r=c||!A.has(t.key);return`
        <section class="task-bucket bucket-${t.key}">
          <button class="bucket-head" type="button" data-bucket="${t.key}" aria-expanded="${r}">
            <span class="bucket-head-left">
              <span>${r?`▾`:`▸`}</span>
              <span>${v(t.label)}</span>
            </span>
            <span class="bucket-count">${v(t.rows.length)}</span>
          </button>
          ${r?t.rows.map(t=>ue(t,e,n,i)).join(``):``}
        </section>`}).join(``)}function de(e,n,r){let i=e.length>0&&r.capabilities.parallelAllowed?`<span class="muted">${v(T===`parallel`?t(`Starts in parallel`,`Spustí sa paralelne`,`Párhuzamos indítás`):t(`Switches active timer`,`Prepne aktívny časovač`,`Aktív időzítő cseréje`))}</span>`:``;return`
    <div class="body stack">
      <div class="row">
        <input id="panel-task-search" type="search" value="${v(O)}" placeholder="${v(t(`Search tasks or projects…`,`Hľadať úlohy alebo projekty…`,`Feladat vagy projekt keresése…`))}" autocomplete="off" />
        <button id="refresh-tasks" class="tiny" type="button" title="${v(t(`Refresh`,`Obnoviť`,`Frissítés`))}">↻</button>
      </div>
      <div class="segmented" role="group" aria-label="${v(t(`Task filter`,`Filter úloh`,`Feladatszűrő`))}">
        <button id="filter-mine" class="seg-btn ${D===`mine`?`active`:``}" type="button">${v(t(`My tasks`,`Moje úlohy`,`Feladataim`))}</button>
        <button id="filter-all" class="seg-btn ${D===`all`?`active`:``}" type="button">${v(t(`All open`,`Všetky otvorené`,`Összes nyitott`))}</button>
      </div>
      ${i}
      <div id="tasks-list-body" class="stack">${J(e,n)}</div>
    </div>`}function fe(e,t){let n=()=>{g.querySelectorAll(`.bucket-head`).forEach(r=>{r.addEventListener(`click`,()=>{let i=r.dataset.bucket||``;if(!i)return;ee=!0,A.has(i)?A.delete(i):A.add(i);let a=g.querySelector(`#tasks-list-body`);a&&(a.innerHTML=J(e,t),n())})}),g.querySelectorAll(`.start-task-btn`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.taskId||``,n=e.dataset.projectId||``,r=e.dataset.title||``;t&&Q({taskId:t,taskTitle:r,projectId:n,projectName:e.dataset.projectName||``,description:r})})}),g.querySelectorAll(`.stop-task-btn`).forEach(t=>{t.addEventListener(`click`,()=>{let n=t.dataset.id||``,r=e.find(e=>String(e.id||``)===n)||e[0];r&&$(r)})})};n();let r=g.querySelector(`#panel-task-search`);r?.addEventListener(`input`,()=>{O=r.value;let i=g.querySelector(`#tasks-list-body`);i&&(i.innerHTML=J(e,t),n())}),g.querySelector(`#filter-mine`)?.addEventListener(`click`,()=>{D=`mine`,W()}),g.querySelector(`#filter-all`)?.addEventListener(`click`,()=>{D=`all`,W()}),g.querySelector(`#refresh-tasks`)?.addEventListener(`click`,()=>{W()})}function Y(e){return`
    <div class="edit-drawer">
      ${!e.taskId&&!e.ticketId?`<input id="edit-desc" value="${v(e.title||``)}" placeholder="${v(t(`Description`,`Popis`,`Leírás`))}" />`:``}
      <input id="edit-note" value="${v(e.note||``)}" placeholder="${v(t(`Add note…`,`Pridať poznámku…`,`Megjegyzés…`))}" />
      <div class="spread">
        <label class="check"><input id="edit-billable" type="checkbox" ${e.billable?`checked`:``} /> ${v(t(`Billable`,`Fakturovateľné`,`Számlázható`))}</label>
        <button id="save-edit" class="tiny primary" type="button" style="color:white">${v(t(`Save`,`Uložiť`,`Mentés`))}</button>
      </div>
    </div>`}function pe(e,n){let r=n.presence;if(!e||!r||r.enabled===!1||r.phase!==`tracking`||!r.promptAt)return``;let i=(n.capabilities.presenceMinutes||50)*6e4,a=Date.parse(r.promptAt)-n.offsetMs,o=Math.max(0,a-Date.now()),s=Math.max(1,Math.ceil(o/6e4)),c=Math.max(5,Math.min(100,Math.round((i-o)/i*100)));return`
    <div class="checkin-bar">
      <div class="spread">
        <span>${v(t(`Next presence check-in`,`Ďalšia kontrola prítomnosti`,`Következő jelenléti ellenőrzés`))}</span>
        <strong>${v(t(`in ${s}m`,`o ${s} min`,`${s} perc múlva`))}</strong>
      </div>
      <div class="checkin-track"><div class="checkin-fill" style="width:${c}%"></div></div>
    </div>`}function X(e){let n=e.presence,r=!!(e.testAlertUntil&&e.testAlertUntil>Date.now());if(n?.phase===`question`&&n.enabled!==!1||r){let e=r?t(`Previewing 50-minute pulse & chime alert.`,`Náhľad 50-minútového pulzného upozornenia.`,`50 perces pulzus és hangjelzés előnézet.`):t(`Confirm before ${o(n?.deadlineAt)} or running timers will pause.`,`Potvrďte do ${o(n?.deadlineAt)}, inak sa časovače pozastavia.`,`Erősítse meg ${o(n?.deadlineAt)}-ig, különben az időzítők leállnak.`);return`
      <div class="question" role="alert">
        <div class="spread"><strong>${v(t(`Still working?`,`Stále pracujete?`,`Még dolgozik?`))}</strong><span class="countdown" id="countdown"></span></div>
        <p class="muted" style="margin:0;color:#92400e">${v(e)}</p>
        <button id="confirm" class="primary wide" type="button">${v(r?t(`Stop alert preview`,`Zastaviť ukážku`,`Előnézet leállítása`):t(`Still working — keep running`,`Áno, pracujem — pokračovať`,`Igen, dolgozom — folytatás`))}</button>
      </div>`}if(n?.phase===`paused`){let r=e.paused.length?t(`resume below or open app`,`obnovte nižšie alebo v aplikácii`,`folytassa alább vagy az alkalmazásban`):t(`open the app to resume`,`obnovte v aplikácii`,`folytassa az alkalmazásban`);return`<div class="paused-banner"><strong>${v(t(`Paused at ${o(n.autoPausedAt)}`,`Pozastavené o ${o(n.autoPausedAt)}`,`Szüneteltetve: ${o(n.autoPausedAt)}`))}</strong> · ${v(r)}</div>`}return``}function me(e){if(!e.paused.length)return``;let n=e.paused.map((e,n)=>`
    <div class="card spread">
      <span class="grow">${v(e.title||t(`Untitled`,`Bez názvu`,`Névtelen`))}<br /><span class="muted">${v(e.projectName||t(`Unsorted`,`Nezaradené`,`Rendezetlen`))} · ${v(t(`paused ${o(e.pausedAt)}`,`pozastavené ${o(e.pausedAt)}`,`szüneteltetve ${o(e.pausedAt)}`))}</span></span>
      <button class="round small soft resume-item" type="button" data-index="${n}" aria-label="${v(t(`Resume`,`Pokračovať`,`Folytatás`))}" title="${v(t(`Resume`,`Pokračovať`,`Folytatás`))}">${F}</button>
      <button class="round small stop stop-paused" type="button" data-index="${n}" aria-label="${v(t(`Stop`,`Zastaviť`,`Leállítás`))}" title="${v(t(`Stop`,`Zastaviť`,`Leállítás`))}">${I}</button>
    </div>`).join(``);return`<div class="stack"><span class="section-label">${v(t(`Paused`,`Pozastavené`,`Szüneteltetve`))}</span>${n}</div>`}function he(e){window.clearInterval(b);let t=!!(e.testAlertUntil&&e.testAlertUntil>Date.now()),n=t?e.testAlertUntil:e.presence?.deadlineAt?Date.parse(e.presence.deadlineAt)-e.offsetMs:NaN,r=g.querySelector(`#countdown`);if(r&&Number.isFinite(n)){let e=()=>{let e=n-Date.now();r.textContent=a(e),e<=0&&(window.clearInterval(b),V().then(()=>W()))};e(),b=window.setInterval(e,1e3)}g.querySelector(`#confirm`)?.addEventListener(`click`,async()=>{t?(await chrome.runtime.sendMessage({type:`stop-test-alert`}),await W()):await ge()}),g.querySelectorAll(`.resume-item`).forEach(t=>{t.addEventListener(`click`,()=>{let n=e.paused[Number(t.dataset.index)];n&&ye(n)})}),g.querySelectorAll(`.stop-paused`).forEach(t=>{t.addEventListener(`click`,()=>{let n=e.paused[Number(t.dataset.index)];n&&$(n)})})}function Z(e){let t=g.querySelector(`#notice`);t&&(t.innerHTML=`<p class="error">${v(e)}</p>`)}async function ge(){let e=g.querySelector(`#confirm`);e&&(e.disabled=!0);let a=await c();try{if(await r(a.ccrmUrl,a.deviceKey,`POST`,`confirm`),_){window.close();return}}catch(r){if(r instanceof i&&r.code===`offline`){e&&(e.disabled=!1),Z(t(`Could not reach ${n}. Try again.`,`${n} nie je dostupný. Skúste znova.`,`A ${n} nem érhető el. Próbálja újra.`));return}}await V(),await W()}async function _e(e){let t=await c();try{await r(t.ccrmUrl,t.deviceKey,`POST`,`pause`,{id:e})}catch(e){let t=e instanceof i?e.code:`offline`;Z(d(t))}await V(),await W()}async function ve(e,t){let n=await c();try{await r(n.ccrmUrl,n.deviceKey,`POST`,`update`,{id:e,...t}),w=null}catch(e){let t=e instanceof i?e.code:`offline`;Z(d(t))}await V(),await W()}async function ye(e){let t=await c();try{await r(t.ccrmUrl,t.deviceKey,`POST`,`resume`,{id:e.id,mode:T})}catch(e){let t=e instanceof i?e.code:`offline`;await V(),await W(),t!==`already_running`&&t!==`not_paused`&&Z(d(t));return}await V(),await W()}function be(){let e=``,n=``,i=``,a=``,o=g.querySelector(`#title`),s=g.querySelector(`#project`),l=g.querySelector(`#task-picked`),u=g.querySelector(`#task-list`),d=g.querySelector(`#project-list`),f=()=>{e?(l.hidden=!1,l.innerHTML=`<span class="pill">${v(t(`Task:`,`Úloha:`,`Feladat:`))} ${v(n)} <button id="clear-task" type="button" style="height:auto;padding:0 4px;background:transparent;color:#4a5a20">×</button></span>`,g.querySelector(`#clear-task`)?.addEventListener(`click`,()=>{e=``,n=``,f()})):(l.hidden=!0,l.innerHTML=``)},p=0,m=async l=>{let d=await c();if(d.deviceKey)try{let c=(await r(d.ccrmUrl,d.deviceKey,`GET`,`myTasks`,{},{q:l,...i?{projectId:i}:{}})).tasks||[];if(!c.length){u.innerHTML=``;return}u.innerHTML=c.slice(0,6).map((e,n)=>{let r=[e.projectName,e.clientName].filter(Boolean).join(` · `)||t(`No project`,`Bez projektu`,`Nincs projekt`);return`
            <button class="pick task-pick" type="button" data-idx="${n}">
              <span class="pick-main">
                <span class="pick-title" title="${v(e.title)}">${v(e.title)}</span>
                <span class="pick-sub" title="${v(r)}">${v(r)}</span>
              </span>
              ${e.mine?`<span class="pill">${v(t(`Mine`,`Moja`,`Saját`))}</span>`:``}
            </button>`}).join(``),u.querySelectorAll(`.task-pick`).forEach(t=>{t.addEventListener(`click`,()=>{let r=c[Number(t.dataset.idx)];r&&(e=r.id,n=r.title,o.value=r.title,r.projectId&&(i=r.projectId,a=r.projectName||``,s.value=a),u.innerHTML=``,f())})})}catch{u.innerHTML=``}};o.addEventListener(`focus`,()=>{!u.innerHTML&&!e&&m(o.value.trim())}),o.addEventListener(`input`,()=>{e&&o.value!==n&&(e=``,n=``,f()),window.clearTimeout(p),p=window.setTimeout(()=>void m(o.value.trim()),180)});let h=0;s.addEventListener(`input`,()=>{i=``,a=``,window.clearTimeout(h),h=window.setTimeout(async()=>{let e=await c(),n=await we();try{let c=(await r(e.ccrmUrl,e.deviceKey,`GET`,`projects`,{},{q:s.value,host:n})).projects||[];d.innerHTML=c.slice(0,6).map((e,n)=>`<button class="pick proj-pick" type="button" data-idx="${n}"><span class="dot"></span><span class="pick-main"><span class="pick-title" title="${v(e.name)}">${v(e.name)}</span></span>${e.suggested?`<span class="muted">${v(t(`suggested`,`navrhnuté`,`javasolt`))}</span>`:``}</button>`).join(``),d.querySelectorAll(`.proj-pick`).forEach(e=>{e.addEventListener(`click`,()=>{let t=c[Number(e.dataset.idx)];t&&(i=t.id,a=t.name,s.value=t.name,d.innerHTML=``,m(o.value.trim()))})})}catch{d.innerHTML=``}},180)}),g.querySelector(`#start`)?.addEventListener(`click`,()=>{Q({description:e?``:o.value.trim(),projectId:i,projectName:a,taskId:e,taskTitle:n,mode:T})}),Te((e,t)=>{!s.value&&!i&&(i=e,a=t,s.value=t)})}function xe(e){if(!e.length)return``;let n=e.slice(0,5).map((e,n)=>`
    <div class="recent-row">
      <span class="grow"><span class="recent-title">${v(e.title||t(`Untitled`,`Bez názvu`,`Névtelen`))}</span><span class="muted">${v(e.projectName||``)}</span></span>
      <button class="round small soft continue" type="button" data-index="${n}" aria-label="${v(t(`Continue`,`Pokračovať`,`Folytatás`))}" title="${v(t(`Continue`,`Pokračovať`,`Folytatás`))}">${F}</button>
    </div>`).join(``);return`<div class="stack"><span class="section-label">${v(t(`Recent`,`Nedávne`,`Legutóbbi`))}</span>${n}</div>`}function Se(e){g.querySelectorAll(`.continue`).forEach(t=>{t.addEventListener(`click`,()=>{let n=e[Number(t.dataset.index)];n&&Q({description:n.titleSource===`entry`?n.title:``,projectId:n.projectId||``,projectName:n.projectName||``,taskId:n.taskId||``,taskTitle:n.titleSource===`task`?n.title:``,ticketId:n.ticketId||``,mode:T})})})}function Ce(e){g.querySelector(`.footer a`)?.addEventListener(`click`,t=>{t.preventDefault(),chrome.tabs.create({url:`${e}/#time-tracking`})})}async function we(){try{if(!await chrome.permissions.contains({permissions:[`tabs`]}))return``;let t=await chrome.tabs.query({active:!0,currentWindow:!0});return e(t?.[0]?.url||``)||``}catch{return``}}async function Te(e){let t=await we();if(!t)return;let n=await c();try{let i=((await r(n.ccrmUrl,n.deviceKey,`GET`,`projects`,{},{q:``,host:t})).projects||[]).find(e=>e.suggested);i&&e(i.id,i.name)}catch{}}async function Q(e){let n=await c(),a=new Date().toISOString(),o={mode:e.mode===`parallel`?`parallel`:`switch`};e.description&&(o.description=e.description),e.projectId&&(o.projectId=e.projectId),e.taskId&&(o.taskId=e.taskId),e.ticketId&&(o.ticketId=e.ticketId);let l={startedAt:a,title:e.description||e.taskTitle||t(`Running`,`Beží`,`Fut`),projectName:e.projectName,taskTitle:e.taskTitle};if(!navigator.onLine)await H({kind:`start`,at:a,body:o},l),C=!1,await W();else try{await r(n.ccrmUrl,n.deviceKey,`POST`,`start`,{...o,startedAt:a}),await s({optimistic:null}),C=!1,await V(),await W()}catch(e){if(e instanceof i&&e.code===`offline`){await H({kind:`start`,at:a,body:o},l),C=!1,await W();return}if(e instanceof i&&e.code===`not_paired`){x=``,await s({deviceKey:``,optimistic:null}),U(t(`Pair this browser again.`,`Spárujte tento prehliadač znova.`,`Párosítsa újra ezt a böngészőt.`));return}if(e instanceof i&&e.code===`already_running`){await s({optimistic:null}),C=!1,await V(),await W();return}let n=g.querySelector(`#form-error`);n&&(n.hidden=!1,n.textContent=e instanceof i?d(e.code):t(`Could not start.`,`Nepodarilo sa spustiť.`,`Az indítás nem sikerült.`))}}async function $(e){let n=await c(),a=new Date().toISOString(),o={};if(e?.id&&(o.id=e.id),!navigator.onLine)await H({kind:`stop`,at:a,body:o},null),await W();else try{await r(n.ccrmUrl,n.deviceKey,`POST`,`stop`,{...o,stoppedAt:a}),await s({optimistic:null}),w=null,await V(),await W()}catch(e){if(e instanceof i&&e.code===`offline`){await H({kind:`stop`,at:a,body:o},null),await W();return}if(e instanceof i&&e.code===`ambiguous`){await s({optimistic:null}),await W();return}if(e instanceof i&&e.code===`project_required`){let e=g.querySelector(`#notice`);e&&(e.innerHTML=`<p class="error">${v(d(`project_required`))}</p><label>${v(t(`Project id`,`ID projektu`,`Projekt azonosító`))}<input id="stop-project" /></label><button id="stop-retry" class="stop" type="button">${v(t(`Stop`,`Zastaviť`,`Leállítás`))}</button>`),g.querySelector(`#stop-retry`)?.addEventListener(`click`,()=>{o.projectId=g.querySelector(`#stop-project`).value.trim(),r(n.ccrmUrl,n.deviceKey,`POST`,`stop`,{...o,stoppedAt:a}).then(()=>W()).catch(()=>void 0)});return}if(e instanceof i&&e.code===`not_paired`){x=``,await s({deviceKey:``,optimistic:null,lost:[...n.lost,{id:crypto.randomUUID(),kind:`stop`,at:a,body:o}]}),U(t(`Pair this browser again. The stop was kept on this device.`,`Spárujte tento prehliadač znova. Zastavenie zostalo uložené v tomto zariadení.`,`Párosítsa újra ezt a böngészőt. A leállítás ezen az eszközön maradt.`));return}let c=e instanceof i?e.code:`offline`;(c===`not_found`||c===`not_running`)&&(await s({optimistic:null}),await V(),await W()),Z(d(c))}}function Ee(){if(S||w||M)return!0;let e=document.activeElement;return!!e&&g.contains(e)&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)}async function De(){if(document.visibilityState!==`visible`||N||Ee())return;let e=await c();if(!(!e.deviceKey||!e.ccrmUrl||e.queue.length>0||e.optimistic)){N=!0;try{h(await r(e.ccrmUrl,e.deviceKey,`GET`,`running`))!==j&&!Ee()&&await W()}catch{}finally{N=!1}}}g?.addEventListener(`input`,()=>{M=!0}),window.setInterval(()=>void De(),m),document.addEventListener(`visibilitychange`,()=>void De()),document.title=t(`${n} Time Tracker`,`${n} Sledovanie času`,`${n} Időkövetés`),W();