import{b as e,d as t,f as n,g as r,h as i,i as a,l as o,m as s,p as c,r as l,s as u,u as d,v as f,y as p}from"./presence.js";var m=document.querySelector(`#app`),h=m?.dataset?.mode===`alert`,g=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]||e),_,v,y=``,b=!1,x=!1,S=null,C=`switch`,w=`time`,T=`mine`,E=``,D=[],O=new Set([`tomorrow`,`upcoming`]),k=!1,A=e=>e.split(/\s+/).filter(Boolean).slice(0,2).map(e=>e[0].toUpperCase()).join(``),j=`<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"/></svg>`,M=`<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2.2" y="2" width="2.6" height="8" rx="0.8" fill="currentColor"/><rect x="7.2" y="2" width="2.6" height="8" rx="0.8" fill="currentColor"/></svg>`,N=`<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"/></svg>`,ee=`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M9.4 1.6a1.4 1.4 0 0 0-2.8 0l-.2.9a5.2 5.2 0 0 0-1.2.7l-.9-.3a1.4 1.4 0 0 0-1.4 2.4l.7.6a5.4 5.4 0 0 0 0 1.4l-.7.6a1.4 1.4 0 0 0 1.4 2.4l.9-.3c.4.3.8.5 1.2.7l.2.9a1.4 1.4 0 0 0 2.8 0l.2-.9c.4-.2.8-.4 1.2-.7l.9.3a1.4 1.4 0 0 0 1.4-2.4l-.7-.6a5.4 5.4 0 0 0 0-1.4l.7-.6a1.4 1.4 0 0 0-1.4-2.4l-.9.3a5.2 5.2 0 0 0-1.2-.7l-.2-.9zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>`,P=`<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M11.8 2.2a1.4 1.4 0 0 1 2 2L5.7 12.3 2.5 13l.7-3.2 8.6-7.6z"/></svg>`,F=()=>({parallelAllowed:!1,maxParallel:4,sameProject:`differentTasks`,presenceMinutes:50}),te=e=>({presence:null,paused:[],offsetMs:0,ccrmUrl:e,capabilities:F(),testAlertUntil:null});function I(e,r=!0){let i=e===null?``:`<span class="muted">${g(t(`Today`,`Dnes`,`Ma`))} ${g(p(e))}</span>`,a=A(y)?`<span class="avatar" title="${g(y)}">${g(A(y))}</span>`:``,o=r?`<button id="toggle-settings" class="icon-btn ${b?`active`:``}" type="button" title="${g(t(`Extension settings`,`Nastavenia rozšírenia`,`Bővítmény beállítások`))}" aria-label="${g(t(`Settings`,`Nastavenia`,`Beállítások`))}">${ee}</button>`:``;return`<div class="head"><strong class="brand">${g(n)}</strong><span class="head-end">${i}${a}${o}</span></div>`}function L(e){try{let t=new URL(e.includes(`://`)?e:`https://${e}`);return t.protocol!==`https:`&&t.protocol!==`http:`?null:t.origin}catch{return null}}function R(){let e=navigator.userAgent;return/Windows/.test(e)?`Windows`:/Mac/.test(e)?`macOS`:/Linux/.test(e)?`Linux`:`Unknown`}async function z(){try{await chrome.runtime.sendMessage({type:`refresh`})}catch{}}async function B(e,t){let n=await c();await s({queue:[...n.queue,{...e,id:crypto.randomUUID()}].slice(-50),optimistic:t}),await z()}function V(e,r){return`<div class="footer">${`<a href="${g(r)}/#time-tracking" target="_blank" rel="noreferrer">${g(t(`Open ${n}`,`Otvoriť ${n}`,`${n} megnyitása`))}</a>`}${e>0?`<span class="unsorted">${g(e)} ${g(t(`unsorted`,`nezaradené`,`rendezetlen`))}</span>`:`<span></span>`}</div>`}function H(e=``){window.clearInterval(_),window.clearInterval(v),m.innerHTML=`
    ${I(null,!1)}
    <div class="body stack">
      <h1>${g(t(`Connect to ${n}`,`Pripojiť k ${n}`,`Csatlakozás: ${n}`))}</h1>
      <label>${g(t(`${n} address`,`Adresa ${n}`,`${n} címe`))}
        <div class="row">
          <input id="url" placeholder="https://crm.example.com" autocomplete="url" />
          <button id="use-tab" class="tiny" type="button" title="${g(t(`Use open tab URL`,`Použiť URL otvorenej karty`,`Aktuális fül címe`))}">${g(t(`Tab`,`Karta`,`Fül`))}</button>
        </div>
      </label>
      <label>${g(t(`Pairing code`,`Párovací kód`,`Párosítási kód`))}<input id="code" class="mono" placeholder="K7Q4-9MZT" autocapitalize="characters" /></label>
      ${e?`<p class="error">${g(e)}</p>`:``}
      <button id="connect" class="primary wide" type="button">${g(t(`Connect`,`Pripojiť`,`Csatlakozás`))}</button>
      <p class="muted">${g(t(`Get a one-time pairing code in ${n} under Time tracking → Chrome extension (or Settings → Time tracking).`,`Jednorazový párovací kód získate v ${n} v Evidencia času → Rozšírenie Chrome (alebo Nastavenia → Evidencia času).`,`Az egyszer használatos kódot a ${n} Időkövetés → Chrome-bővítmény alatt (vagy a Beállításokban) találja.`))}</p>
    </div>`,c().then(e=>{let t=m.querySelector(`#url`);e.ccrmUrl&&(t.value=e.ccrmUrl)}),m.querySelector(`#use-tab`)?.addEventListener(`click`,async()=>{try{if(!await chrome.permissions.request({permissions:[`tabs`]}))return;let e=L((await chrome.tabs.query({active:!0,currentWindow:!0}))?.[0]?.url||``);e&&(m.querySelector(`#url`).value=e)}catch{}}),m.querySelector(`#connect`)?.addEventListener(`click`,()=>void ne())}async function ne(){let e=L(m.querySelector(`#url`).value.trim()),a=m.querySelector(`#code`).value.trim();if(!e){H(t(`Enter a full ${n} address.`,`Zadajte celú adresu ${n}.`,`Adja meg a ${n} teljes címét.`));return}let o=m.querySelector(`#connect`);o.disabled=!0;try{if(!await chrome.permissions.request({origins:[`${e}/*`]})){H(t(`Chrome needs permission to reach that address.`,`Chrome potrebuje povolenie na prístup k tejto adrese.`,`A Chrome-nak engedély kell a cím eléréséhez.`));return}let n=await r(e,``,`POST`,`pair`,{code:a,deviceName:`Chrome on ${R()}`,browser:`Chrome`,os:R(),version:f});await s({ccrmUrl:e,deviceKey:n.deviceKey,userName:n.user?.name||``,queue:[],optimistic:null}),await z(),await U()}catch(e){let t=e instanceof i?e.code:`offline`;H(d(t===`not_paired`?`code_invalid`:t))}}async function U(){let e=await c();if(y=e.userName||``,e.prefs.defaultStartMode===`parallel`&&(C=`parallel`),!e.deviceKey||!e.ccrmUrl)b=!1,H(e.lost.length?t(`This browser is not paired. The actions below were not saved.`,`Tento prehliadač nie je spárovaný. Akcie nižšie neboli uložené.`,`Ez a böngésző nincs párosítva. Az alábbi műveletek nem lettek mentve.`):``),e.lost.length&&W(e.lost);else if(b){let t={enabled:!1};try{t=await r(e.ccrmUrl,e.deviceKey,`GET`,`rules`)}catch{}re(e,!!t.enabled)}else try{let[t,n,i,a,o]=await Promise.all([r(e.ccrmUrl,e.deviceKey,`GET`,`running`),r(e.ccrmUrl,e.deviceKey,`GET`,`recent`),r(e.ccrmUrl,e.deviceKey,`GET`,`unsortedCount`),r(e.ccrmUrl,e.deviceKey,`GET`,`rules`),r(e.ccrmUrl,e.deviceKey,`GET`,`myTasks`,{},{}).catch(()=>({tasks:[]}))]);D=Array.isArray(o?.tasks)?o.tasks:[];let s=e.optimistic?[{id:``,running:!0,title:e.optimistic.title,projectName:e.optimistic.projectName,startAt:e.optimistic.startedAt,taskId:e.optimistic.taskTitle?`local`:null,titleSource:`entry`,billable:!0}]:Array.isArray(t.running)&&t.running.length>0?t.running:t.entry?.running?[t.entry]:[],c=t.capabilities&&typeof t.capabilities==`object`?{parallelAllowed:!!t.capabilities.parallelAllowed,maxParallel:Number(t.capabilities.maxParallel)||4,sameProject:String(t.capabilities.sameProject||`differentTasks`),presenceMinutes:Number(t.capabilities.presenceMinutes)||50}:F();c.parallelAllowed||(C=`switch`);let l={presence:t.presence&&typeof t.presence.phase==`string`?t.presence:null,paused:Array.isArray(t.paused)?t.paused:[],offsetMs:u(t.serverNow),ccrmUrl:e.ccrmUrl,capabilities:c,testAlertUntil:e.testAlertUntil};G({items:s,workedTodaySeconds:Number(t.workedTodaySeconds??n.todaySeconds??0),recent:n.entries||[],unsorted:i.count||0,rulesEnabled:!!a.enabled,ccrmUrl:e.ccrmUrl,offline:!1,extras:l})}catch(r){if(r instanceof i&&r.code===`not_paired`){let e=(await c()).lost;y=``,await s({deviceKey:``,userName:``,optimistic:null,snapshot:null}),H(t(`This browser was revoked. Pair it again.`,`Tomuto prehliadaču bol prístup odobratý. Spárujte ho znova.`,`Ennek a böngészőnek a hozzáférését visszavonták. Párosítsa újra.`)),e.length&&W(e);return}if(r instanceof i&&r.code===`offline`){G({items:e.optimistic?[{id:``,running:!0,title:e.optimistic.title,projectName:e.optimistic.projectName,startAt:e.optimistic.startedAt,titleSource:`entry`,billable:!0}]:[],workedTodaySeconds:0,recent:[],unsorted:0,rulesEnabled:!1,ccrmUrl:e.ccrmUrl,offline:!0,extras:te(e.ccrmUrl)});return}H(r instanceof i?d(r.code):t(`Could not reach ${n}.`,`${n} nie je dostupný.`,`A ${n} nem érhető el.`))}}function re(e,n){window.clearInterval(_),window.clearInterval(v);let{prefs:i,testAlertUntil:a,ccrmUrl:o}=e,c=!!(a&&a>Date.now());m.innerHTML=`
    ${I(null)}
    <div class="body stack">
      <div class="spread">
        <h1>${g(t(`Extension settings`,`Nastavenia rozšírenia`,`Bővítmény beállítások`))}</h1>
        <button id="back-tracker" class="tiny" type="button">${g(t(`Back`,`Späť`,`Vissza`))}</button>
      </div>
      <div class="card stack">
        <span class="section-label">${g(t(`50-minute check-in alert`,`50-minútové upozornenie`,`50 perces ellenőrzés`))}</span>
        <label class="check"><input id="pref-flash" type="checkbox" ${i.flashWindow?`checked`:``} /> ${g(t(`Pulse icon & flash Chrome taskbar/dock`,`Pulzovať ikonu a blikať okno Chrome`,`Ikon és Chrome tálca/dock villogtatása`))}</label>
        <label class="check"><input id="pref-sound" type="checkbox" ${i.soundEnabled?`checked`:``} /> ${g(t(`Play two-tone chime`,`Prehrať zvukový signál`,`Hangjelzés lejátszása`))}</label>
        <label>${g(t(`Chime volume`,`Hlasitosť signálu`,`Hangerő`))}
          <input id="pref-vol" type="range" min="10" max="100" value="${Math.round((i.soundVolume??.7)*100)}" />
        </label>
        <label class="check"><input id="pref-popout" type="checkbox" ${i.autoPopoutAlert?`checked`:``} /> ${g(t(`Auto-open mini confirmation window at 50 min`,`Automaticky otvoriť mini okno po 50 min`,`Mini megerősítő ablak automatikus megnyitása 50 perc után`))}</label>
        <div class="row">
          <button id="test-alert" class="${c?`tiny danger wide`:`tiny wide`}" type="button">
            ${g(c?t(`Stop pulse test`,`Zastaviť test pulzu`,`Teszt leállítása`):t(`Test 50-min pulse alert (10s)`,`Otestovať 50-min pulz (10s)`,`50 perces pulzus teszt (10 mp)`))}
          </button>
        </div>
      </div>

      <div class="card stack">
        <span class="section-label">${g(t(`Timers & Shortcuts`,`Časovače a skratky`,`Időzítők és billentyűparancsok`))}</span>
        <label>${g(t(`Default when another timer runs`,`Predvolené pri bežiacom časovači`,`Alapértelmezett mód futó időzítő esetén`))}
          <select id="pref-mode">
            <option value="switch" ${i.defaultStartMode===`switch`?`selected`:``}>${g(t(`Switch (stop previous)`,`Prepnúť (zastaviť predchádzajúci)`,`Váltás (előző leállítása)`))}</option>
            <option value="parallel" ${i.defaultStartMode===`parallel`?`selected`:``}>${g(t(`Run in parallel (if allowed)`,`Spustiť paralelne (ak je povolené)`,`Párhuzamos indítás (ha engedélyezett)`))}</option>
          </select>
        </label>
        <label class="check"><input id="pref-capture" type="checkbox" ${n?`checked`:``} /> ${g(t(`Remember watched sites when idle`,`Sledovať vybrané stránky bez časovača`,`Figyelt oldalak rögzítése üresjáratban`))}</label>
        <p class="muted">${g(t(`Shortcuts: Alt+Shift+T (open), Alt+Shift+S (confirm / pause). Right-click any page to start tracking it.`,`Skratky: Alt+Shift+T (otvoriť), Alt+Shift+S (potvrdiť / pozastaviť). Pravým klikom na stránke spustíte meranie.`,`Parancsok: Alt+Shift+T (megnyitás), Alt+Shift+S (megerősítés / szünet). Jobb kattintással bármely oldal mérhető.`))}</p>
      </div>

      <div class="card stack">
        <span class="section-label">${g(t(`Connection`,`Pripojenie`,`Kapcsolat`))}</span>
        <div class="muted">${g(o)} · v${g(f)}</div>
        <button id="unpair" class="tiny danger wide" type="button">${g(t(`Disconnect browser`,`Odpojiť prehliadač`,`Böngésző leválasztása`))}</button>
      </div>
    </div>`,m.querySelector(`#toggle-settings`)?.addEventListener(`click`,()=>{b=!1,U()}),m.querySelector(`#back-tracker`)?.addEventListener(`click`,()=>{b=!1,U()});let l=async t=>{await s({prefs:{...e.prefs,...t}}),await chrome.runtime.sendMessage({type:`prefs-updated`}).catch(()=>{})};m.querySelector(`#pref-flash`)?.addEventListener(`change`,e=>void l({flashWindow:e.target.checked})),m.querySelector(`#pref-sound`)?.addEventListener(`change`,e=>void l({soundEnabled:e.target.checked})),m.querySelector(`#pref-vol`)?.addEventListener(`change`,e=>void l({soundVolume:Number(e.target.value)/100})),m.querySelector(`#pref-popout`)?.addEventListener(`change`,e=>void l({autoPopoutAlert:e.target.checked})),m.querySelector(`#pref-mode`)?.addEventListener(`change`,e=>{let t=e.target.value===`parallel`?`parallel`:`switch`;C=t,l({defaultStartMode:t})}),m.querySelector(`#pref-capture`)?.addEventListener(`change`,async t=>{let n=t.target,i=n.checked;if(i&&!await chrome.permissions.request({permissions:[`tabs`]}))n.checked=!1;else try{await r(e.ccrmUrl,e.deviceKey,`POST`,`capture`,{enabled:i})}catch{n.checked=!i}}),m.querySelector(`#test-alert`)?.addEventListener(`click`,async()=>{await chrome.runtime.sendMessage({type:c?`stop-test-alert`:`test-alert`}),await U()}),m.querySelector(`#unpair`)?.addEventListener(`click`,async()=>{await s({deviceKey:``,userName:``,queue:[],optimistic:null,snapshot:null,testAlertUntil:null}),y=``,b=!1,await z(),H()})}function W(e){let n=e.map(e=>`<li>${g(e.kind)} · ${g(new Date(e.at).toLocaleString())}</li>`).join(``);m.insertAdjacentHTML(`beforeend`,`<div class="amber" style="margin-top:8px"><strong>${g(t(`Not sent`,`Neodoslané`,`Nem elküldve`))}</strong><ul>${n}</ul><button id="clear-lost" class="tiny" type="button">${g(t(`Dismiss`,`Zavrieť`,`Elvetés`))}</button></div>`),m.querySelector(`#clear-lost`)?.addEventListener(`click`,()=>{s({lost:[]}).then(()=>U())})}function G(e){let{items:n,workedTodaySeconds:r,recent:i,unsorted:a,ccrmUrl:o,offline:s,extras:c}=e,u=Date.now(),d=n.length,f=d===0||x,p=d===1?r+(Number.isFinite(Date.parse(n[0].startAt))?Math.max(0,Math.floor((Date.now()-Date.parse(n[0].startAt))/1e3)):0):r,v=d===1?n[0]:null,y=v?[v.projectName,v.taskId&&v.titleSource!==`entry`?v.title:``].filter(Boolean).join(` · `):``,T=v?`
      <div class="running-band">
        <div class="grow">
          <h1>${g(v.title||t(`Running`,`Beží`,`Fut`))}</h1>
          <p class="project-line"><span class="dot"></span>${g(y||t(`Unsorted (no project yet)`,`Nezaradené (zatiaľ bez projektu)`,`Rendezetlen (még nincs projekt)`))}</p>
          <div class="row" style="margin-top:4px">
            <span class="elapsed item-elapsed" data-start="${g(v.startAt)}" style="margin:0;font-size:28px">0:00:00</span>
            <span class="pill ${v.billable?`billable-on`:`billable-off`}">${v.billable?g(t(`Billable`,`Fakturovateľné`,`Számlázható`)):g(t(`Non-billable`,`Nefakturovateľné`,`Nem számlázható`))}</span>
          </div>
          ${S===v.id?J(v):``}
        </div>
        <div class="stack" style="gap:6px">
          <div class="row" style="gap:6px">
            ${v.id?`<button class="round small pause pause-item" type="button" data-id="${g(v.id)}" title="${g(t(`Pause`,`Pozastaviť`,`Szünet`))}">${M}</button>`:``}
            <button class="round stop stop-item" type="button" data-id="${g(v.id||``)}" title="${g(t(`Stop`,`Zastaviť`,`Leállítás`))}">${N}</button>
          </div>
          ${v.id?`<button class="tiny edit-toggle" type="button" data-id="${g(v.id)}">${P} ${g(t(`Edit`,`Upraviť`,`Szerk.`))}</button>`:``}
        </div>
      </div>`:d>1?`
        <div class="body stack" style="padding-bottom:0">
          <div class="spread">
            <h1>${g(d)} ${g(t(`timers running`,`bežiacich časovačov`,`futó időzítő`))}</h1>
            <span><span class="muted">${g(t(`Worked today`,`Odpracované dnes`,`Ma dolgozott`))}</span> <strong id="worked">${g(l(r))}</strong></span>
          </div>
          ${n.map(e=>`
            <div class="card">
              <div class="spread">
                <span class="grow">
                  <strong>${g(e.title||t(`Untitled`,`Bez názvu`,`Névtelen`))}</strong>
                  <br /><span class="muted">${g(e.projectName||t(`Unsorted`,`Nezaradené`,`Rendezetlen`))}</span>
                </span>
                <span class="item-elapsed" data-start="${g(e.startAt)}">0:00:00</span>
                <button class="round small soft edit-toggle" type="button" data-id="${g(e.id)}" title="${g(t(`Edit`,`Upraviť`,`Szerkesztés`))}">${P}</button>
                <button class="round small pause pause-item" type="button" data-id="${g(e.id)}" title="${g(t(`Pause`,`Pozastaviť`,`Szünet`))}">${M}</button>
                <button class="round small stop stop-item" type="button" data-id="${g(e.id)}" title="${g(t(`Stop`,`Zastaviť`,`Leállítás`))}">${N}</button>
              </div>
              ${S===e.id?J(e):``}
            </div>`).join(``)}
        </div>`:``,E=d>0&&c.capabilities.parallelAllowed?`
      <div class="segmented" role="group" aria-label="${g(t(`Start mode`,`Režim spustenia`,`Indítási mód`))}">
        <button id="mode-switch" class="seg-btn ${C===`switch`?`active`:``}" type="button">${g(t(`Switch active`,`Prepnúť aktívny`,`Aktív cseréje`))}</button>
        <button id="mode-parallel" class="seg-btn ${C===`parallel`?`active`:``}" type="button">${g(t(`Run in parallel`,`Spustiť paralelne`,`Párhuzamosan`))}</button>
      </div>`:``,D=f?`
      <div class="card stack" style="background:#f8fafc">
        <div class="spread">
          <span class="section-label">${g(d>0?t(`Start another timer`,`Spustiť ďalší časovač`,`Új időzítő indítása`):t(`What are you working on?`,`Na čom pracuješ?`,`Min dolgozik?`))}</span>
          ${d>0?`<button id="close-start" class="tiny" type="button">${g(t(`Hide`,`Skryť`,`Elrejtés`))}</button>`:``}
        </div>
        ${E}
        <input id="title" aria-label="${g(t(`Search my tasks or type description`,`Hľadať úlohy alebo napísať popis`,`Feladat keresése vagy leírás`))}" placeholder="${g(t(`Search open tasks or type description…`,`Hľadať úlohu alebo napísať popis…`,`Nyitott feladat keresése vagy leírás…`))}" autocomplete="off" />
        <div id="task-picked" class="muted" hidden></div>
        <div id="task-list" class="picker"></div>
        <input id="project" aria-label="${g(t(`Project (optional)`,`Projekt (voliteľné)`,`Projekt (opcionális)`))}" placeholder="${g(t(`Filter or attach project (optional)…`,`Projekt (voliteľné)…`,`Projekt hozzáadása (opcionális)…`))}" autocomplete="off" />
        <div id="project-list" class="picker"></div>
        <p id="form-error" class="error" hidden></p>
        <button id="start" class="primary wide" type="button">${j} ${g(d>0&&C===`parallel`?t(`Start in parallel`,`Spustiť paralelne`,`Indítás párhuzamosan`):t(`Start timer`,`Spustiť časovač`,`Időzítő indítása`))}</button>
      </div>`:`<button id="open-start" class="tiny wide" type="button">${j} ${g(t(`Start / add another timer`,`Spustiť / pridať ďalší časovač`,`Új / párhuzamos időzítő indítása`))}</button>`,O=h?`time`:w;m.innerHTML=`
    ${I(p)}
    ${h?``:ie(d)}
    ${le(d,c)}
    ${s?`<p class="amber note">${g(t(`Offline. Changes queue until back online.`,`Offline. Zmeny sa odošlú po pripojení.`,`Offline. A módosítások sorba állnak.`))}</p>`:``}
    <div id="notice" class="notice note"></div>
    ${Y(c)?`<div class="body" style="padding-bottom:0">${Y(c)}</div>`:``}
    ${O===`tasks`?`${se(n,o,c)}`:`${T}
        <div class="body stack">
          ${ue(c)}
          ${D}
          ${_e(i)}
          ${V(a,o)}
        </div>`}`;let k=()=>{let e=m.querySelector(`#worked`);e&&(e.textContent=l(r+(Date.now()-u)/1e3)),m.querySelectorAll(`.item-elapsed`).forEach(e=>{let t=Date.parse(e.dataset.start||``);Number.isFinite(t)&&(e.textContent=l((Date.now()+c.offsetMs-t)/1e3))})};k(),window.clearInterval(_),_=window.setInterval(k,1e3),m.querySelector(`#toggle-settings`)?.addEventListener(`click`,()=>{b=!0,U()}),m.querySelector(`#tab-time`)?.addEventListener(`click`,()=>{w!==`time`&&(w=`time`,G(e))}),m.querySelector(`#tab-tasks`)?.addEventListener(`click`,()=>{w!==`tasks`&&(w=`tasks`,G(e))}),m.querySelectorAll(`.stop-item`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.id||``,r=n.find(e=>String(e.id||``)===t)||n[0];r&&$(r)})}),m.querySelectorAll(`.pause-item`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.id||``;t&&pe(t)})}),m.querySelectorAll(`.edit-toggle`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.id||``;S=S===t?null:t,U()})}),m.querySelector(`#save-edit`)?.addEventListener(`click`,()=>{if(!S)return;let e=m.querySelector(`#edit-note`)?.value??``,t=!!m.querySelector(`#edit-billable`)?.checked,n=m.querySelector(`#edit-desc`);me(S,{note:e,billable:t,...n?{description:n.value.trim()}:{}})}),m.querySelector(`#open-start`)?.addEventListener(`click`,()=>{x=!0,U()}),m.querySelector(`#close-start`)?.addEventListener(`click`,()=>{x=!1,U()}),m.querySelector(`#mode-switch`)?.addEventListener(`click`,()=>{C=`switch`,U()}),m.querySelector(`#mode-parallel`)?.addEventListener(`click`,()=>{C=`parallel`,U()}),O===`tasks`?ce(n,o):(f&&ge(),ve(i)),de(c),ye(o)}function ie(e){let n=D.filter(e=>e.mine).length,r=D.length;return`
    <div class="panel-tabs" role="tablist" aria-label="${g(t(`Panel section`,`Sekcia panela`,`Panel szakasz`))}">
      <button id="tab-time" class="panel-tab ${w===`time`?`active`:``}" type="button" role="tab" aria-selected="${w===`time`}">
        ${g(t(`Time`,`Čas`,`Idő`))}
        ${e>0?`<span class="tab-badge">${g(e)}</span>`:``}
      </button>
      <button id="tab-tasks" class="panel-tab ${w===`tasks`?`active`:``}" type="button" role="tab" aria-selected="${w===`tasks`}">
        ${g(t(`Tasks`,`Úlohy`,`Feladatok`))}
        ${r>0?`<span class="tab-badge">${g(T===`mine`?n:r)}</span>`:``}
      </button>
    </div>`}function ae(){let e=E.trim().toLowerCase();return D.filter(t=>T===`mine`&&!t.mine?!1:!e||String(t.title||``).toLowerCase().includes(e)||String(t.projectName||``).toLowerCase().includes(e)||String(t.clientName||``).toLowerCase().includes(e)||String(t.status||``).toLowerCase().includes(e))}function K(e=0){let t=new Date(Date.now()+e*864e5);return`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,`0`)}-${String(t.getDate()).padStart(2,`0`)}`}function oe(e,n,r,i){let a=n.find(t=>String(t.taskId||``)===String(e.id||``)),o=String(e.deadline||``),s=!!(o&&o<i),c=String(e.priority||``)===`high`,l=[e.projectName||e.clientName,e.status].filter(Boolean),u=o?o.slice(5):``,d=[e.projectName,e.clientName,e.status,o].filter(Boolean).join(` · `);return`
    <div class="task-row ${a?`is-running`:``}">
      <div class="task-row-main">
        <div class="task-row-title" title="${g(e.title||``)}">
          ${c?`<span class="prio-dot" title="${g(t(`High priority`,`Vysoká priorita`,`Magas prioritás`))}"></span>`:``}
          <span class="task-row-title-text">${g(e.title||t(`Untitled task`,`Úloha bez názvu`,`Névtelen feladat`))}</span>
        </div>
        <div class="task-row-sub" title="${g(d)}">
          ${g(l.join(` · `))}${l.length&&u?` · `:``}${u?`<span class="${s?`overdue-text`:``}">${g(u)}</span>`:``}
        </div>
      </div>
      <div class="task-row-acts">
        ${a?`<span class="item-elapsed" data-start="${g(a.startAt)}">0:00:00</span>
             <button class="mini-btn stop stop-task-btn" type="button" data-id="${g(a.id)}" title="${g(t(`Stop`,`Zastaviť`,`Leállítás`))}">${N}</button>`:`<button class="mini-btn play start-task-btn" type="button" data-task-id="${g(e.id)}" data-project-id="${g(e.projectId||``)}" data-title="${g(e.title||``)}" title="${g(t(`Start timer`,`Spustiť časovač`,`Időzítő indítása`))}">${j}</button>`}
        <a class="icon-link" href="${g(r)}/#tasks" target="_blank" rel="noopener" title="${g(t(`Open in CRM`,`Otvoriť v CRM`,`Megnyitás a CRM-ben`))}">↗</a>
      </div>
    </div>`}function q(e,n){let r=ae();if(!r.length)return`<p class="muted" style="text-align:center;padding:12px 0">${g(t(`No matching open tasks.`,`Žiadne otvorené úlohy.`,`Nincs nyitott feladat.`))}</p>`;let i=K(0),a=K(1),o=[{key:`overdue`,label:t(`Overdue`,`Po termíne`,`Lejárt`),rows:[]},{key:`today`,label:t(`Today`,`Dnes`,`Ma`),rows:[]},{key:`tomorrow`,label:t(`Tomorrow`,`Zajtra`,`Holnap`),rows:[]},{key:`upcoming`,label:t(`Upcoming`,`Nadchádzajúce`,`Közelgő`),rows:[]}];for(let e of r){let t=String(e.deadline||``);t&&t<i?o[0].rows.push(e):t===i?o[1].rows.push(e):t===a?o[2].rows.push(e):o[3].rows.push(e)}let s=o.filter(e=>e.rows.length>0);!k&&o[0].rows.length===0&&o[1].rows.length===0&&s.length>0&&O.delete(s[0].key);let c=E.trim().length>0;return s.map(t=>{let r=c||!O.has(t.key);return`
        <section class="task-bucket bucket-${t.key}">
          <button class="bucket-head" type="button" data-bucket="${t.key}" aria-expanded="${r}">
            <span class="bucket-head-left">
              <span>${r?`▾`:`▸`}</span>
              <span>${g(t.label)}</span>
            </span>
            <span class="bucket-count">${g(t.rows.length)}</span>
          </button>
          ${r?t.rows.map(t=>oe(t,e,n,i)).join(``):``}
        </section>`}).join(``)}function se(e,n,r){let i=e.length>0&&r.capabilities.parallelAllowed?`<span class="muted">${g(C===`parallel`?t(`Starts in parallel`,`Spustí sa paralelne`,`Párhuzamos indítás`):t(`Switches active timer`,`Prepne aktívny časovač`,`Aktív időzítő cseréje`))}</span>`:``;return`
    <div class="body stack">
      <div class="row">
        <input id="panel-task-search" type="search" value="${g(E)}" placeholder="${g(t(`Search tasks or projects…`,`Hľadať úlohy alebo projekty…`,`Feladat vagy projekt keresése…`))}" autocomplete="off" />
        <button id="refresh-tasks" class="tiny" type="button" title="${g(t(`Refresh`,`Obnoviť`,`Frissítés`))}">↻</button>
      </div>
      <div class="segmented" role="group" aria-label="${g(t(`Task filter`,`Filter úloh`,`Feladatszűrő`))}">
        <button id="filter-mine" class="seg-btn ${T===`mine`?`active`:``}" type="button">${g(t(`My tasks`,`Moje úlohy`,`Feladataim`))}</button>
        <button id="filter-all" class="seg-btn ${T===`all`?`active`:``}" type="button">${g(t(`All open`,`Všetky otvorené`,`Összes nyitott`))}</button>
      </div>
      ${i}
      <div id="tasks-list-body" class="stack">${q(e,n)}</div>
    </div>`}function ce(e,t){let n=()=>{m.querySelectorAll(`.bucket-head`).forEach(r=>{r.addEventListener(`click`,()=>{let i=r.dataset.bucket||``;if(!i)return;k=!0,O.has(i)?O.delete(i):O.add(i);let a=m.querySelector(`#tasks-list-body`);a&&(a.innerHTML=q(e,t),n())})}),m.querySelectorAll(`.start-task-btn`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.taskId||``,n=e.dataset.projectId||``,r=e.dataset.title||``;t&&Q({taskId:t,...n?{projectId:n}:{},description:r})})}),m.querySelectorAll(`.stop-task-btn`).forEach(t=>{t.addEventListener(`click`,()=>{let n=t.dataset.id||``,r=e.find(e=>String(e.id||``)===n)||e[0];r&&$(r)})})};n();let r=m.querySelector(`#panel-task-search`);r?.addEventListener(`input`,()=>{E=r.value;let i=m.querySelector(`#tasks-list-body`);i&&(i.innerHTML=q(e,t),n())}),m.querySelector(`#filter-mine`)?.addEventListener(`click`,()=>{T=`mine`,U()}),m.querySelector(`#filter-all`)?.addEventListener(`click`,()=>{T=`all`,U()}),m.querySelector(`#refresh-tasks`)?.addEventListener(`click`,()=>{U()})}function J(e){return`
    <div class="edit-drawer">
      ${!e.taskId&&!e.ticketId?`<input id="edit-desc" value="${g(e.title||``)}" placeholder="${g(t(`Description`,`Popis`,`Leírás`))}" />`:``}
      <input id="edit-note" value="${g(e.note||``)}" placeholder="${g(t(`Add note…`,`Pridať poznámku…`,`Megjegyzés…`))}" />
      <div class="spread">
        <label class="check"><input id="edit-billable" type="checkbox" ${e.billable?`checked`:``} /> ${g(t(`Billable`,`Fakturovateľné`,`Számlázható`))}</label>
        <button id="save-edit" class="tiny primary" type="button" style="color:white">${g(t(`Save`,`Uložiť`,`Mentés`))}</button>
      </div>
    </div>`}function le(e,n){let r=n.presence;if(!e||!r||r.enabled===!1||r.phase!==`tracking`||!r.promptAt)return``;let i=(n.capabilities.presenceMinutes||50)*6e4,a=Date.parse(r.promptAt)-n.offsetMs,o=Math.max(0,a-Date.now()),s=Math.max(1,Math.ceil(o/6e4)),c=Math.max(5,Math.min(100,Math.round((i-o)/i*100)));return`
    <div class="checkin-bar">
      <div class="spread">
        <span>${g(t(`Next presence check-in`,`Ďalšia kontrola prítomnosti`,`Következő jelenléti ellenőrzés`))}</span>
        <strong>${g(t(`in ${s}m`,`o ${s} min`,`${s} perc múlva`))}</strong>
      </div>
      <div class="checkin-track"><div class="checkin-fill" style="width:${c}%"></div></div>
    </div>`}function Y(e){let n=e.presence,r=!!(e.testAlertUntil&&e.testAlertUntil>Date.now());if(n?.phase===`question`&&n.enabled!==!1||r){let e=r?t(`Previewing 50-minute pulse & chime alert.`,`Náhľad 50-minútového pulzného upozornenia.`,`50 perces pulzus és hangjelzés előnézet.`):t(`Confirm before ${o(n?.deadlineAt)} or running timers will pause.`,`Potvrďte do ${o(n?.deadlineAt)}, inak sa časovače pozastavia.`,`Erősítse meg ${o(n?.deadlineAt)}-ig, különben az időzítők leállnak.`);return`
      <div class="question" role="alert">
        <div class="spread"><strong>${g(t(`Still working?`,`Stále pracujete?`,`Még dolgozik?`))}</strong><span class="countdown" id="countdown"></span></div>
        <p class="muted" style="margin:0;color:#92400e">${g(e)}</p>
        <button id="confirm" class="primary wide" type="button">${g(r?t(`Stop alert preview`,`Zastaviť ukážku`,`Előnézet leállítása`):t(`Still working — keep running`,`Áno, pracujem — pokračovať`,`Igen, dolgozom — folytatás`))}</button>
      </div>`}if(n?.phase===`paused`){let r=e.paused.length?t(`resume below or open app`,`obnovte nižšie alebo v aplikácii`,`folytassa alább vagy az alkalmazásban`):t(`open the app to resume`,`obnovte v aplikácii`,`folytassa az alkalmazásban`);return`<div class="paused-banner"><strong>${g(t(`Paused at ${o(n.autoPausedAt)}`,`Pozastavené o ${o(n.autoPausedAt)}`,`Szüneteltetve: ${o(n.autoPausedAt)}`))}</strong> · ${g(r)}</div>`}return``}function ue(e){if(!e.paused.length)return``;let n=e.paused.map((e,n)=>`
    <div class="card spread">
      <span class="grow">${g(e.title||t(`Untitled`,`Bez názvu`,`Névtelen`))}<br /><span class="muted">${g(e.projectName||t(`Unsorted`,`Nezaradené`,`Rendezetlen`))} · ${g(t(`paused ${o(e.pausedAt)}`,`pozastavené ${o(e.pausedAt)}`,`szüneteltetve ${o(e.pausedAt)}`))}</span></span>
      <button class="round small soft resume-item" type="button" data-index="${n}" aria-label="${g(t(`Resume`,`Pokračovať`,`Folytatás`))}" title="${g(t(`Resume`,`Pokračovať`,`Folytatás`))}">${j}</button>
      <button class="round small stop stop-paused" type="button" data-index="${n}" aria-label="${g(t(`Stop`,`Zastaviť`,`Leállítás`))}" title="${g(t(`Stop`,`Zastaviť`,`Leállítás`))}">${N}</button>
    </div>`).join(``);return`<div class="stack"><span class="section-label">${g(t(`Paused`,`Pozastavené`,`Szüneteltetve`))}</span>${n}</div>`}function de(e){window.clearInterval(v);let t=!!(e.testAlertUntil&&e.testAlertUntil>Date.now()),n=t?e.testAlertUntil:e.presence?.deadlineAt?Date.parse(e.presence.deadlineAt)-e.offsetMs:NaN,r=m.querySelector(`#countdown`);if(r&&Number.isFinite(n)){let e=()=>{let e=n-Date.now();r.textContent=a(e),e<=0&&(window.clearInterval(v),z().then(()=>U()))};e(),v=window.setInterval(e,1e3)}m.querySelector(`#confirm`)?.addEventListener(`click`,async()=>{t?(await chrome.runtime.sendMessage({type:`stop-test-alert`}),await U()):await fe()}),m.querySelectorAll(`.resume-item`).forEach(t=>{t.addEventListener(`click`,()=>{let n=e.paused[Number(t.dataset.index)];n&&he(n)})}),m.querySelectorAll(`.stop-paused`).forEach(t=>{t.addEventListener(`click`,()=>{let n=e.paused[Number(t.dataset.index)];n&&$(n)})})}function X(e){let t=m.querySelector(`#notice`);t&&(t.innerHTML=`<p class="error">${g(e)}</p>`)}async function fe(){let e=m.querySelector(`#confirm`);e&&(e.disabled=!0);let a=await c();try{if(await r(a.ccrmUrl,a.deviceKey,`POST`,`confirm`),h){window.close();return}}catch(r){if(r instanceof i&&r.code===`offline`){e&&(e.disabled=!1),X(t(`Could not reach ${n}. Try again.`,`${n} nie je dostupný. Skúste znova.`,`A ${n} nem érhető el. Próbálja újra.`));return}}await z(),await U()}async function pe(e){let t=await c();try{await r(t.ccrmUrl,t.deviceKey,`POST`,`pause`,{id:e})}catch(e){let t=e instanceof i?e.code:`offline`;X(d(t))}await z(),await U()}async function me(e,t){let n=await c();try{await r(n.ccrmUrl,n.deviceKey,`POST`,`update`,{id:e,...t}),S=null}catch(e){let t=e instanceof i?e.code:`offline`;X(d(t))}await z(),await U()}async function he(e){let t=await c();try{await r(t.ccrmUrl,t.deviceKey,`POST`,`resume`,{id:e.id,mode:C})}catch(e){let t=e instanceof i?e.code:`offline`;await z(),await U(),t!==`already_running`&&t!==`not_paused`&&X(d(t));return}await z(),await U()}function ge(){let e=``,n=``,i=``,a=``,o=m.querySelector(`#title`),s=m.querySelector(`#project`),l=m.querySelector(`#task-picked`),u=m.querySelector(`#task-list`),d=m.querySelector(`#project-list`),f=()=>{e?(l.hidden=!1,l.innerHTML=`<span class="pill">${g(t(`Task:`,`Úloha:`,`Feladat:`))} ${g(n)} <button id="clear-task" type="button" style="height:auto;padding:0 4px;background:transparent;color:#4a5a20">×</button></span>`,m.querySelector(`#clear-task`)?.addEventListener(`click`,()=>{e=``,n=``,f()})):(l.hidden=!0,l.innerHTML=``)},p=0,h=async l=>{let d=await c();if(d.deviceKey)try{let c=(await r(d.ccrmUrl,d.deviceKey,`GET`,`myTasks`,{},{q:l,...i?{projectId:i}:{}})).tasks||[];if(!c.length){u.innerHTML=``;return}u.innerHTML=c.slice(0,6).map((e,n)=>{let r=[e.projectName,e.clientName].filter(Boolean).join(` · `)||t(`No project`,`Bez projektu`,`Nincs projekt`);return`
            <button class="pick task-pick" type="button" data-idx="${n}">
              <span class="pick-main">
                <span class="pick-title" title="${g(e.title)}">${g(e.title)}</span>
                <span class="pick-sub" title="${g(r)}">${g(r)}</span>
              </span>
              ${e.mine?`<span class="pill">${g(t(`Mine`,`Moja`,`Saját`))}</span>`:``}
            </button>`}).join(``),u.querySelectorAll(`.task-pick`).forEach(t=>{t.addEventListener(`click`,()=>{let r=c[Number(t.dataset.idx)];r&&(e=r.id,n=r.title,o.value=r.title,r.projectId&&(i=r.projectId,a=r.projectName||``,s.value=a),u.innerHTML=``,f())})})}catch{u.innerHTML=``}};o.addEventListener(`focus`,()=>{!u.innerHTML&&!e&&h(o.value.trim())}),o.addEventListener(`input`,()=>{e&&o.value!==n&&(e=``,n=``,f()),window.clearTimeout(p),p=window.setTimeout(()=>void h(o.value.trim()),180)});let _=0;s.addEventListener(`input`,()=>{i=``,a=``,window.clearTimeout(_),_=window.setTimeout(async()=>{let e=await c(),n=await Z();try{let c=(await r(e.ccrmUrl,e.deviceKey,`GET`,`projects`,{},{q:s.value,host:n})).projects||[];d.innerHTML=c.slice(0,6).map((e,n)=>`<button class="pick proj-pick" type="button" data-idx="${n}"><span class="dot"></span><span class="pick-main"><span class="pick-title" title="${g(e.name)}">${g(e.name)}</span></span>${e.suggested?`<span class="muted">${g(t(`suggested`,`navrhnuté`,`javasolt`))}</span>`:``}</button>`).join(``),d.querySelectorAll(`.proj-pick`).forEach(e=>{e.addEventListener(`click`,()=>{let t=c[Number(e.dataset.idx)];t&&(i=t.id,a=t.name,s.value=t.name,d.innerHTML=``,h(o.value.trim()))})})}catch{d.innerHTML=``}},180)}),m.querySelector(`#start`)?.addEventListener(`click`,()=>{Q({description:e?``:o.value.trim(),projectId:i,projectName:a,taskId:e,taskTitle:n,mode:C})}),be((e,t)=>{!s.value&&!i&&(i=e,a=t,s.value=t)})}function _e(e){if(!e.length)return``;let n=e.slice(0,5).map((e,n)=>`
    <div class="recent-row">
      <span class="grow"><span class="recent-title">${g(e.title||t(`Untitled`,`Bez názvu`,`Névtelen`))}</span><span class="muted">${g(e.projectName||``)}</span></span>
      <button class="round small soft continue" type="button" data-index="${n}" aria-label="${g(t(`Continue`,`Pokračovať`,`Folytatás`))}" title="${g(t(`Continue`,`Pokračovať`,`Folytatás`))}">${j}</button>
    </div>`).join(``);return`<div class="stack"><span class="section-label">${g(t(`Recent`,`Nedávne`,`Legutóbbi`))}</span>${n}</div>`}function ve(e){m.querySelectorAll(`.continue`).forEach(t=>{t.addEventListener(`click`,()=>{let n=e[Number(t.dataset.index)];n&&Q({description:n.titleSource===`entry`?n.title:``,projectId:n.projectId||``,projectName:n.projectName||``,taskId:n.taskId||``,taskTitle:n.titleSource===`task`?n.title:``,ticketId:n.ticketId||``,mode:C})})})}function ye(e){m.querySelector(`.footer a`)?.addEventListener(`click`,t=>{t.preventDefault(),chrome.tabs.create({url:`${e}/#time-tracking`})})}async function Z(){try{if(!await chrome.permissions.contains({permissions:[`tabs`]}))return``;let t=await chrome.tabs.query({active:!0,currentWindow:!0});return e(t?.[0]?.url||``)||``}catch{return``}}async function be(e){let t=await Z();if(!t)return;let n=await c();try{let i=((await r(n.ccrmUrl,n.deviceKey,`GET`,`projects`,{},{q:``,host:t})).projects||[]).find(e=>e.suggested);i&&e(i.id,i.name)}catch{}}async function Q(e){let n=await c(),a=new Date().toISOString(),o={mode:e.mode===`parallel`?`parallel`:`switch`};e.description&&(o.description=e.description),e.projectId&&(o.projectId=e.projectId),e.taskId&&(o.taskId=e.taskId),e.ticketId&&(o.ticketId=e.ticketId);let l={startedAt:a,title:e.description||e.taskTitle||t(`Running`,`Beží`,`Fut`),projectName:e.projectName,taskTitle:e.taskTitle};if(!navigator.onLine)await B({kind:`start`,at:a,body:o},l),x=!1,await U();else try{await r(n.ccrmUrl,n.deviceKey,`POST`,`start`,{...o,startedAt:a}),await s({optimistic:null}),x=!1,await z(),await U()}catch(e){if(e instanceof i&&e.code===`offline`){await B({kind:`start`,at:a,body:o},l),x=!1,await U();return}if(e instanceof i&&e.code===`not_paired`){y=``,await s({deviceKey:``,optimistic:null}),H(t(`Pair this browser again.`,`Spárujte tento prehliadač znova.`,`Párosítsa újra ezt a böngészőt.`));return}if(e instanceof i&&e.code===`already_running`){await s({optimistic:null}),x=!1,await z(),await U();return}let n=m.querySelector(`#form-error`);n&&(n.hidden=!1,n.textContent=e instanceof i?d(e.code):t(`Could not start.`,`Nepodarilo sa spustiť.`,`Az indítás nem sikerült.`))}}async function $(e){let n=await c(),a=new Date().toISOString(),o={};if(e?.id&&(o.id=e.id),!navigator.onLine)await B({kind:`stop`,at:a,body:o},null),await U();else try{await r(n.ccrmUrl,n.deviceKey,`POST`,`stop`,{...o,stoppedAt:a}),await s({optimistic:null}),S=null,await z(),await U()}catch(e){if(e instanceof i&&e.code===`offline`){await B({kind:`stop`,at:a,body:o},null),await U();return}if(e instanceof i&&e.code===`ambiguous`){await s({optimistic:null}),await U();return}if(e instanceof i&&e.code===`project_required`){let e=m.querySelector(`#notice`);e&&(e.innerHTML=`<p class="error">${g(d(`project_required`))}</p><label>${g(t(`Project id`,`ID projektu`,`Projekt azonosító`))}<input id="stop-project" /></label><button id="stop-retry" class="stop" type="button">${g(t(`Stop`,`Zastaviť`,`Leállítás`))}</button>`),m.querySelector(`#stop-retry`)?.addEventListener(`click`,()=>{o.projectId=m.querySelector(`#stop-project`).value.trim(),r(n.ccrmUrl,n.deviceKey,`POST`,`stop`,{...o,stoppedAt:a}).then(()=>U()).catch(()=>void 0)});return}if(e instanceof i&&e.code===`not_paired`){y=``,await s({deviceKey:``,optimistic:null,lost:[...n.lost,{id:crypto.randomUUID(),kind:`stop`,at:a,body:o}]}),H(t(`Pair this browser again. The stop was kept on this device.`,`Spárujte tento prehliadač znova. Zastavenie zostalo uložené v tomto zariadení.`,`Párosítsa újra ezt a böngészőt. A leállítás ezen az eszközön maradt.`));return}let c=e instanceof i?e.code:`offline`;(c===`not_found`||c===`not_running`)&&(await s({optimistic:null}),await z(),await U()),X(d(c))}}document.title=t(`${n} Time Tracker`,`${n} Sledovanie času`,`${n} Időkövetés`),U();