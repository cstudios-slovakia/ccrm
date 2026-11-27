import{b as e,d as t,f as n,g as r,h as i,i as a,l as o,m as s,p as c,r as l,s as u,u as d,v as f,y as p}from"./presence.js";var m=e=>e.replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]||e),h=e=>{let t=[],n=m(e).replace(/`([^`\n]+)`/g,(e,n)=>`\u0000CODE${t.push(`<code>${n}</code>`)-1}\u0000`);return n=n.replace(/\*\*([^*\n]+)\*\*/g,`<strong>$1</strong>`),n=n.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,`$1<em>$2</em>`),n.replace(/\u0000CODE(\d+)\u0000/g,(e,n)=>t[Number(n)]||``)};function g(e){let t=String(e??``).replace(/\r\n?/g,`
`).trim();if(!t)return``;let n=t.split(`
`),r=[],i=null,a=[],o=()=>{a.length&&(r.push(`<p>${a.map(h).join(`<br />`)}</p>`),a=[])},s=()=>{i&&=(r.push(`</${i}>`),null)};for(let e of n){let t=e.trim();if(!t){o(),s();continue}let n=t.match(/^(#{1,3})\s+(.+)$/);if(n){o(),s();let e=n[1].length+2;r.push(`<h${e}>${h(n[2])}</h${e}>`);continue}let c=t.match(/^[-*]\s+(.+)$/);if(c){o(),i!==`ul`&&(s(),r.push(`<ul>`),i=`ul`),r.push(`<li>${h(c[1])}</li>`);continue}let l=t.match(/^\d+\.\s+(.+)$/);l?(o(),i!==`ol`&&(s(),r.push(`<ol>`),i=`ol`),r.push(`<li>${h(l[1])}</li>`)):(s(),a.push(t))}return o(),s(),r.join(``)}function _(e,t,n,r){let i=e.slice(0,t),a=e.slice(t,n),o=e.slice(n);if(r===`bullet`){let e=i.length>0&&!i.endsWith(`
`)?`
- `:`- `,t=a?a.split(`
`).join(`
- `):``,n=`${i}${e}${t}${o}`,r=i.length+e.length+t.length;return{value:n,selectionStart:r,selectionEnd:r}}let s=r===`bold`?`**`:r===`italic`?`*`:"`",c=a||(r===`bold`||r===`italic`?`text`:`code`),l=`${i}${s}${c}${s}${o}`,u=i.length+s.length;return{value:l,selectionStart:u,selectionEnd:u+c.length}}var v=document.querySelector(`#app`),y=v?.dataset?.mode===`alert`,b=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]||e),x,S,C=``,w=!1,T=!1,E=null,D=`switch`,O=`time`,k=null,A=!1,j=`mine`,M=``,N=[],P=new Set([`tomorrow`,`upcoming`]),ee=!1,F=null,I=``,L=!1,te=e=>e.split(/\s+/).filter(Boolean).slice(0,2).map(e=>e[0].toUpperCase()).join(``),R=`<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"/></svg>`,z=`<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2.2" y="2" width="2.6" height="8" rx="0.8" fill="currentColor"/><rect x="7.2" y="2" width="2.6" height="8" rx="0.8" fill="currentColor"/></svg>`,B=`<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"/></svg>`,ne=`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M9.4 1.6a1.4 1.4 0 0 0-2.8 0l-.2.9a5.2 5.2 0 0 0-1.2.7l-.9-.3a1.4 1.4 0 0 0-1.4 2.4l.7.6a5.4 5.4 0 0 0 0 1.4l-.7.6a1.4 1.4 0 0 0 1.4 2.4l.9-.3c.4.3.8.5 1.2.7l.2.9a1.4 1.4 0 0 0 2.8 0l.2-.9c.4-.2.8-.4 1.2-.7l.9.3a1.4 1.4 0 0 0 1.4-2.4l-.7-.6a5.4 5.4 0 0 0 0-1.4l.7-.6a1.4 1.4 0 0 0-1.4-2.4l-.9.3a5.2 5.2 0 0 0-1.2-.7l-.2-.9zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>`,V=`<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M11.8 2.2a1.4 1.4 0 0 1 2 2L5.7 12.3 2.5 13l.7-3.2 8.6-7.6z"/></svg>`,re=`<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M9.8 1.8a.8.8 0 0 0-1.1 0L6.6 3.9l-2.3.7a.8.8 0 0 0-.3 1.3l2.1 2.1-3.3 4.2a.6.6 0 0 0 .8.8l4.2-3.3 2.1 2.1a.8.8 0 0 0 1.3-.3l.7-2.3 2.1-2.1a.8.8 0 0 0 0-1.1L9.8 1.8z"/></svg>`,ie=()=>({parallelAllowed:!1,maxParallel:4,sameProject:`differentTasks`,presenceMinutes:50}),ae=e=>({presence:null,paused:[],offsetMs:0,ccrmUrl:e,capabilities:ie(),testAlertUntil:null});function H(e,r=!0){let i=e===null?``:`<span class="muted">${b(t(`Today`,`Dnes`,`Ma`))} ${b(p(e))}</span>`,a=te(C)?`<span class="avatar" title="${b(C)}">${b(te(C))}</span>`:``,o=r?`<button id="toggle-settings" class="icon-btn ${w?`active`:``}" type="button" title="${b(t(`Extension settings`,`Nastavenia rozšírenia`,`Bővítmény beállítások`))}" aria-label="${b(t(`Settings`,`Nastavenia`,`Beállítások`))}">${ne}</button>`:``;return`<div class="head"><strong class="brand">${b(n)}</strong><span class="head-end">${i}${a}${o}</span></div>`}function oe(e){try{let t=new URL(e.includes(`://`)?e:`https://${e}`);return t.protocol!==`https:`&&t.protocol!==`http:`?null:t.origin}catch{return null}}function U(){let e=navigator.userAgent;return/Windows/.test(e)?`Windows`:/Mac/.test(e)?`macOS`:/Linux/.test(e)?`Linux`:`Unknown`}async function W(){try{await chrome.runtime.sendMessage({type:`refresh`})}catch{}}async function G(e,t){let n=await c();await s({queue:[...n.queue,{...e,id:crypto.randomUUID()}].slice(-50),optimistic:t}),await W()}function se(e,r){return`<div class="footer">${`<a href="${b(r)}/#time-tracking" target="_blank" rel="noreferrer">${b(t(`Open ${n}`,`Otvoriť ${n}`,`${n} megnyitása`))}</a>`}${e>0?`<span class="unsorted">${b(e)} ${b(t(`unsorted`,`nezaradené`,`rendezetlen`))}</span>`:`<span></span>`}</div>`}function K(e=``){window.clearInterval(x),window.clearInterval(S),v.innerHTML=`
    ${H(null,!1)}
    <div class="body stack">
      <h1>${b(t(`Connect to ${n}`,`Pripojiť k ${n}`,`Csatlakozás: ${n}`))}</h1>
      <label>${b(t(`${n} address`,`Adresa ${n}`,`${n} címe`))}
        <div class="row">
          <input id="url" placeholder="https://crm.example.com" autocomplete="url" />
          <button id="use-tab" class="tiny" type="button" title="${b(t(`Use open tab URL`,`Použiť URL otvorenej karty`,`Aktuális fül címe`))}">${b(t(`Tab`,`Karta`,`Fül`))}</button>
        </div>
      </label>
      <label>${b(t(`Pairing code`,`Párovací kód`,`Párosítási kód`))}<input id="code" class="mono" placeholder="K7Q4-9MZT" autocapitalize="characters" /></label>
      ${e?`<p class="error">${b(e)}</p>`:``}
      <button id="connect" class="primary wide" type="button">${b(t(`Connect`,`Pripojiť`,`Csatlakozás`))}</button>
      <p class="muted">${b(t(`Get a one-time pairing code in ${n} under Time tracking → Chrome extension (or Settings → Time tracking).`,`Jednorazový párovací kód získate v ${n} v Evidencia času → Rozšírenie Chrome (alebo Nastavenia → Evidencia času).`,`Az egyszer használatos kódot a ${n} Időkövetés → Chrome-bővítmény alatt (vagy a Beállításokban) találja.`))}</p>
    </div>`,c().then(e=>{let t=v.querySelector(`#url`);e.ccrmUrl&&(t.value=e.ccrmUrl)}),v.querySelector(`#use-tab`)?.addEventListener(`click`,async()=>{try{if(!await chrome.permissions.request({permissions:[`tabs`]}))return;let e=oe((await chrome.tabs.query({active:!0,currentWindow:!0}))?.[0]?.url||``);e&&(v.querySelector(`#url`).value=e)}catch{}}),v.querySelector(`#connect`)?.addEventListener(`click`,()=>void ce())}async function ce(){let e=oe(v.querySelector(`#url`).value.trim()),a=v.querySelector(`#code`).value.trim();if(!e){K(t(`Enter a full ${n} address.`,`Zadajte celú adresu ${n}.`,`Adja meg a ${n} teljes címét.`));return}let o=v.querySelector(`#connect`);o.disabled=!0;try{if(!await chrome.permissions.request({origins:[`${e}/*`]})){K(t(`Chrome needs permission to reach that address.`,`Chrome potrebuje povolenie na prístup k tejto adrese.`,`A Chrome-nak engedély kell a cím eléréséhez.`));return}let n=await r(e,``,`POST`,`pair`,{code:a,deviceName:`Chrome on ${U()}`,browser:`Chrome`,os:U(),version:f});await s({ccrmUrl:e,deviceKey:n.deviceKey,userName:n.user?.name||``,queue:[],optimistic:null}),await W(),await q()}catch(e){let t=e instanceof i?e.code:`offline`;K(d(t===`not_paired`?`code_invalid`:t))}}async function q(){let e=await c();if(C=e.userName||``,k=e.prefs.pinnedTab??null,A||=(O=k??(e.prefs.lastTab===`tasks`?`tasks`:`time`),!0),e.prefs.defaultStartMode===`parallel`&&(D=`parallel`),!e.deviceKey||!e.ccrmUrl)w=!1,K(e.lost.length?t(`This browser is not paired. The actions below were not saved.`,`Tento prehliadač nie je spárovaný. Akcie nižšie neboli uložené.`,`Ez a böngésző nincs párosítva. Az alábbi műveletek nem lettek mentve.`):``),e.lost.length&&J(e.lost);else if(w){let t={enabled:!1};try{t=await r(e.ccrmUrl,e.deviceKey,`GET`,`rules`)}catch{}le(e,!!t.enabled)}else try{let[t,n,i,a,o]=await Promise.all([r(e.ccrmUrl,e.deviceKey,`GET`,`running`),r(e.ccrmUrl,e.deviceKey,`GET`,`recent`),r(e.ccrmUrl,e.deviceKey,`GET`,`unsortedCount`),r(e.ccrmUrl,e.deviceKey,`GET`,`rules`),r(e.ccrmUrl,e.deviceKey,`GET`,`myTasks`,{},{}).catch(()=>({tasks:[]}))]);N=Array.isArray(o?.tasks)?o.tasks:[];let s=e.optimistic?[{id:``,running:!0,title:e.optimistic.title,projectName:e.optimistic.projectName,startAt:e.optimistic.startedAt,taskId:e.optimistic.taskTitle?`local`:null,titleSource:`entry`,billable:!0}]:Array.isArray(t.running)&&t.running.length>0?t.running:t.entry?.running?[t.entry]:[],c=t.capabilities&&typeof t.capabilities==`object`?{parallelAllowed:!!t.capabilities.parallelAllowed,maxParallel:Number(t.capabilities.maxParallel)||4,sameProject:String(t.capabilities.sameProject||`differentTasks`),presenceMinutes:Number(t.capabilities.presenceMinutes)||50}:ie();c.parallelAllowed||(D=`switch`);let l={presence:t.presence&&typeof t.presence.phase==`string`?t.presence:null,paused:Array.isArray(t.paused)?t.paused:[],offsetMs:u(t.serverNow),ccrmUrl:e.ccrmUrl,capabilities:c,testAlertUntil:e.testAlertUntil};Y({items:s,workedTodaySeconds:Number(t.workedTodaySeconds??n.todaySeconds??0),recent:n.entries||[],unsorted:i.count||0,rulesEnabled:!!a.enabled,ccrmUrl:e.ccrmUrl,offline:!1,extras:l})}catch(r){if(r instanceof i&&r.code===`not_paired`){let e=(await c()).lost;C=``,await s({deviceKey:``,userName:``,optimistic:null,snapshot:null}),K(t(`This browser was revoked. Pair it again.`,`Tomuto prehliadaču bol prístup odobratý. Spárujte ho znova.`,`Ennek a böngészőnek a hozzáférését visszavonták. Párosítsa újra.`)),e.length&&J(e);return}if(r instanceof i&&r.code===`offline`){Y({items:e.optimistic?[{id:``,running:!0,title:e.optimistic.title,projectName:e.optimistic.projectName,startAt:e.optimistic.startedAt,titleSource:`entry`,billable:!0}]:[],workedTodaySeconds:0,recent:[],unsorted:0,rulesEnabled:!1,ccrmUrl:e.ccrmUrl,offline:!0,extras:ae(e.ccrmUrl)});return}K(r instanceof i?d(r.code):t(`Could not reach ${n}.`,`${n} nie je dostupný.`,`A ${n} nem érhető el.`))}}function le(e,n){window.clearInterval(x),window.clearInterval(S);let{prefs:i,testAlertUntil:a,ccrmUrl:o}=e,c=!!(a&&a>Date.now());v.innerHTML=`
    ${H(null)}
    <div class="body stack">
      <div class="spread">
        <h1>${b(t(`Extension settings`,`Nastavenia rozšírenia`,`Bővítmény beállítások`))}</h1>
        <button id="back-tracker" class="tiny" type="button">${b(t(`Back`,`Späť`,`Vissza`))}</button>
      </div>
      <div class="card stack">
        <span class="section-label">${b(t(`50-minute check-in alert`,`50-minútové upozornenie`,`50 perces ellenőrzés`))}</span>
        <label class="check"><input id="pref-flash" type="checkbox" ${i.flashWindow?`checked`:``} /> ${b(t(`Pulse icon & flash Chrome taskbar/dock`,`Pulzovať ikonu a blikať okno Chrome`,`Ikon és Chrome tálca/dock villogtatása`))}</label>
        <label class="check"><input id="pref-sound" type="checkbox" ${i.soundEnabled?`checked`:``} /> ${b(t(`Play two-tone chime`,`Prehrať zvukový signál`,`Hangjelzés lejátszása`))}</label>
        <label>${b(t(`Chime volume`,`Hlasitosť signálu`,`Hangerő`))}
          <input id="pref-vol" type="range" min="10" max="100" value="${Math.round((i.soundVolume??.7)*100)}" />
        </label>
        <label class="check"><input id="pref-popout" type="checkbox" ${i.autoPopoutAlert?`checked`:``} /> ${b(t(`Auto-open mini confirmation window at 50 min`,`Automaticky otvoriť mini okno po 50 min`,`Mini megerősítő ablak automatikus megnyitása 50 perc után`))}</label>
        <div class="row">
          <button id="test-alert" class="${c?`tiny danger wide`:`tiny wide`}" type="button">
            ${b(c?t(`Stop pulse test`,`Zastaviť test pulzu`,`Teszt leállítása`):t(`Test 50-min pulse alert (10s)`,`Otestovať 50-min pulz (10s)`,`50 perces pulzus teszt (10 mp)`))}
          </button>
        </div>
      </div>

      <div class="card stack">
        <span class="section-label">${b(t(`Timers & Shortcuts`,`Časovače a skratky`,`Időzítők és billentyűparancsok`))}</span>
        <label>${b(t(`Default when another timer runs`,`Predvolené pri bežiacom časovači`,`Alapértelmezett mód futó időzítő esetén`))}
          <select id="pref-mode">
            <option value="switch" ${i.defaultStartMode===`switch`?`selected`:``}>${b(t(`Switch (stop previous)`,`Prepnúť (zastaviť predchádzajúci)`,`Váltás (előző leállítása)`))}</option>
            <option value="parallel" ${i.defaultStartMode===`parallel`?`selected`:``}>${b(t(`Run in parallel (if allowed)`,`Spustiť paralelne (ak je povolené)`,`Párhuzamos indítás (ha engedélyezett)`))}</option>
          </select>
        </label>
        <label class="check"><input id="pref-capture" type="checkbox" ${n?`checked`:``} /> ${b(t(`Remember watched sites when idle`,`Sledovať vybrané stránky bez časovača`,`Figyelt oldalak rögzítése üresjáratban`))}</label>
        <p class="muted">${b(t(`Shortcuts: Alt+Shift+T (open), Alt+Shift+S (confirm / pause). Right-click any page to start tracking it.`,`Skratky: Alt+Shift+T (otvoriť), Alt+Shift+S (potvrdiť / pozastaviť). Pravým klikom na stránke spustíte meranie.`,`Parancsok: Alt+Shift+T (megnyitás), Alt+Shift+S (megerősítés / szünet). Jobb kattintással bármely oldal mérhető.`))}</p>
      </div>

      <div class="card stack">
        <span class="section-label">${b(t(`Connection`,`Pripojenie`,`Kapcsolat`))}</span>
        <div class="muted">${b(o)} · v${b(f)}</div>
        <button id="unpair" class="tiny danger wide" type="button">${b(t(`Disconnect browser`,`Odpojiť prehliadač`,`Böngésző leválasztása`))}</button>
      </div>
    </div>`,v.querySelector(`#toggle-settings`)?.addEventListener(`click`,()=>{w=!1,q()}),v.querySelector(`#back-tracker`)?.addEventListener(`click`,()=>{w=!1,q()});let l=async t=>{await s({prefs:{...e.prefs,...t}}),await chrome.runtime.sendMessage({type:`prefs-updated`}).catch(()=>{})};v.querySelector(`#pref-flash`)?.addEventListener(`change`,e=>void l({flashWindow:e.target.checked})),v.querySelector(`#pref-sound`)?.addEventListener(`change`,e=>void l({soundEnabled:e.target.checked})),v.querySelector(`#pref-vol`)?.addEventListener(`change`,e=>void l({soundVolume:Number(e.target.value)/100})),v.querySelector(`#pref-popout`)?.addEventListener(`change`,e=>void l({autoPopoutAlert:e.target.checked})),v.querySelector(`#pref-mode`)?.addEventListener(`change`,e=>{let t=e.target.value===`parallel`?`parallel`:`switch`;D=t,l({defaultStartMode:t})}),v.querySelector(`#pref-capture`)?.addEventListener(`change`,async t=>{let n=t.target,i=n.checked;if(i&&!await chrome.permissions.request({permissions:[`tabs`]}))n.checked=!1;else try{await r(e.ccrmUrl,e.deviceKey,`POST`,`capture`,{enabled:i})}catch{n.checked=!i}}),v.querySelector(`#test-alert`)?.addEventListener(`click`,async()=>{await chrome.runtime.sendMessage({type:c?`stop-test-alert`:`test-alert`}),await q()}),v.querySelector(`#unpair`)?.addEventListener(`click`,async()=>{await s({deviceKey:``,userName:``,queue:[],optimistic:null,snapshot:null,testAlertUntil:null}),C=``,w=!1,await W(),K()})}function J(e){let n=e.map(e=>`<li>${b(e.kind)} · ${b(new Date(e.at).toLocaleString())}</li>`).join(``);v.insertAdjacentHTML(`beforeend`,`<div class="amber" style="margin-top:8px"><strong>${b(t(`Not sent`,`Neodoslané`,`Nem elküldve`))}</strong><ul>${n}</ul><button id="clear-lost" class="tiny" type="button">${b(t(`Dismiss`,`Zavrieť`,`Elvetés`))}</button></div>`),v.querySelector(`#clear-lost`)?.addEventListener(`click`,()=>{s({lost:[]}).then(()=>q())})}function Y(e){let{items:n,workedTodaySeconds:r,recent:i,unsorted:a,ccrmUrl:o,offline:c,extras:u}=e,d=Date.now(),f=n.length,p=f===0||T,m=f===1?r+(Number.isFinite(Date.parse(n[0].startAt))?Math.max(0,Math.floor((Date.now()-Date.parse(n[0].startAt))/1e3)):0):r,h=f===1?n[0]:null,g=h?[h.projectName,h.taskId&&h.titleSource!==`entry`?h.title:``].filter(Boolean).join(` · `):``,_=h?`
      <div class="running-band">
        <div class="grow">
          <h1>${b(h.title||t(`Running`,`Beží`,`Fut`))}</h1>
          <p class="project-line"><span class="dot"></span>${b(g||t(`Unsorted (no project yet)`,`Nezaradené (zatiaľ bez projektu)`,`Rendezetlen (még nincs projekt)`))}</p>
          <div class="row" style="margin-top:4px">
            <span class="elapsed item-elapsed" data-start="${b(h.startAt)}" style="margin:0;font-size:28px">0:00:00</span>
            <span class="pill ${h.billable?`billable-on`:`billable-off`}">${h.billable?b(t(`Billable`,`Fakturovateľné`,`Számlázható`)):b(t(`Non-billable`,`Nefakturovateľné`,`Nem számlázható`))}</span>
          </div>
          ${E===h.id?ve(h):``}
        </div>
        <div class="stack" style="gap:6px">
          <div class="row" style="gap:6px">
            ${h.id?`<button class="round small pause pause-item" type="button" data-id="${b(h.id)}" title="${b(t(`Pause`,`Pozastaviť`,`Szünet`))}">${z}</button>`:``}
            <button class="round stop stop-item" type="button" data-id="${b(h.id||``)}" title="${b(t(`Stop`,`Zastaviť`,`Leállítás`))}">${B}</button>
          </div>
          ${h.id?`<button class="tiny edit-toggle" type="button" data-id="${b(h.id)}">${V} ${b(t(`Edit`,`Upraviť`,`Szerk.`))}</button>`:``}
        </div>
      </div>`:f>1?`
        <div class="body stack" style="padding-bottom:0">
          <div class="spread">
            <h1>${b(f)} ${b(t(`timers running`,`bežiacich časovačov`,`futó időzítő`))}</h1>
            <span><span class="muted">${b(t(`Worked today`,`Odpracované dnes`,`Ma dolgozott`))}</span> <strong id="worked">${b(l(r))}</strong></span>
          </div>
          ${n.map(e=>`
            <div class="card">
              <div class="spread">
                <span class="grow">
                  <strong>${b(e.title||t(`Untitled`,`Bez názvu`,`Névtelen`))}</strong>
                  <br /><span class="muted">${b(e.projectName||t(`Unsorted`,`Nezaradené`,`Rendezetlen`))}</span>
                </span>
                <span class="item-elapsed" data-start="${b(e.startAt)}">0:00:00</span>
                <button class="round small soft edit-toggle" type="button" data-id="${b(e.id)}" title="${b(t(`Edit`,`Upraviť`,`Szerkesztés`))}">${V}</button>
                <button class="round small pause pause-item" type="button" data-id="${b(e.id)}" title="${b(t(`Pause`,`Pozastaviť`,`Szünet`))}">${z}</button>
                <button class="round small stop stop-item" type="button" data-id="${b(e.id)}" title="${b(t(`Stop`,`Zastaviť`,`Leállítás`))}">${B}</button>
              </div>
              ${E===e.id?ve(e):``}
            </div>`).join(``)}
        </div>`:``,S=f>0&&u.capabilities.parallelAllowed?`
      <div class="segmented" role="group" aria-label="${b(t(`Start mode`,`Režim spustenia`,`Indítási mód`))}">
        <button id="mode-switch" class="seg-btn ${D===`switch`?`active`:``}" type="button">${b(t(`Switch active`,`Prepnúť aktívny`,`Aktív cseréje`))}</button>
        <button id="mode-parallel" class="seg-btn ${D===`parallel`?`active`:``}" type="button">${b(t(`Run in parallel`,`Spustiť paralelne`,`Párhuzamosan`))}</button>
      </div>`:``,C=p?`
      <div class="card stack" style="background:#f8fafc">
        <div class="spread">
          <span class="section-label">${b(f>0?t(`Start another timer`,`Spustiť ďalší časovač`,`Új időzítő indítása`):t(`What are you working on?`,`Na čom pracuješ?`,`Min dolgozik?`))}</span>
          ${f>0?`<button id="close-start" class="tiny" type="button">${b(t(`Hide`,`Skryť`,`Elrejtés`))}</button>`:``}
        </div>
        ${S}
        <input id="title" aria-label="${b(t(`Search my tasks or type description`,`Hľadať úlohy alebo napísať popis`,`Feladat keresése vagy leírás`))}" placeholder="${b(t(`Search open tasks or type description…`,`Hľadať úlohu alebo napísať popis…`,`Nyitott feladat keresése vagy leírás…`))}" autocomplete="off" />
        <div id="task-picked" class="muted" hidden></div>
        <div id="task-list" class="picker"></div>
        <input id="project" aria-label="${b(t(`Project (optional)`,`Projekt (voliteľné)`,`Projekt (opcionális)`))}" placeholder="${b(t(`Filter or attach project (optional)…`,`Projekt (voliteľné)…`,`Projekt hozzáadása (opcionális)…`))}" autocomplete="off" />
        <div id="project-list" class="picker"></div>
        <p id="form-error" class="error" hidden></p>
        <button id="start" class="primary wide" type="button">${R} ${b(f>0&&D===`parallel`?t(`Start in parallel`,`Spustiť paralelne`,`Indítás párhuzamosan`):t(`Start timer`,`Spustiť časovač`,`Időzítő indítása`))}</button>
      </div>`:`<button id="open-start" class="tiny wide" type="button">${R} ${b(t(`Start / add another timer`,`Spustiť / pridať ďalší časovač`,`Új / párhuzamos időzítő indítása`))}</button>`,A=y?`time`:O;v.innerHTML=`
    ${H(m)}
    ${y?``:ue(f)}
    ${ye(f,u)}
    ${c?`<p class="amber note">${b(t(`Offline. Changes queue until back online.`,`Offline. Zmeny sa odošlú po pripojení.`,`Offline. A módosítások sorba állnak.`))}</p>`:``}
    <div id="notice" class="notice note"></div>
    ${be(u)?`<div class="body" style="padding-bottom:0">${be(u)}</div>`:``}
    ${F?`<div class="body" style="padding-bottom:0">${he()}</div>`:``}
    ${A===`tasks`?`${me(n,o,u)}`:`${_}
        <div class="body stack">
          ${xe(u)}
          ${C}
          ${Oe(i)}
          ${se(a,o)}
        </div>`}`;let j=()=>{let e=v.querySelector(`#worked`);e&&(e.textContent=l(r+(Date.now()-d)/1e3)),v.querySelectorAll(`.item-elapsed`).forEach(e=>{let t=Date.parse(e.dataset.start||``);Number.isFinite(t)&&(e.textContent=l((Date.now()+u.offsetMs-t)/1e3))})};j(),window.clearInterval(x),x=window.setInterval(j,1e3),v.querySelector(`#toggle-settings`)?.addEventListener(`click`,()=>{w=!0,q()}),v.querySelector(`#tab-time`)?.addEventListener(`click`,()=>{O!==`time`&&(O=`time`,s({prefs:{lastTab:`time`}}),Y(e))}),v.querySelector(`#tab-tasks`)?.addEventListener(`click`,()=>{O!==`tasks`&&(O=`tasks`,s({prefs:{lastTab:`tasks`}}),Y(e))}),v.querySelectorAll(`.pin-btn`).forEach(t=>{t.addEventListener(`click`,n=>{n.stopPropagation();let r=t.dataset.pinTab===`tasks`?`tasks`:`time`,i=k===r?null:r;k=i,i&&(O=i),s({prefs:{pinnedTab:i,lastTab:O}}),Y(e)})}),v.querySelectorAll(`.stop-item`).forEach(t=>{t.addEventListener(`click`,()=>{let r=t.dataset.id||``,i=n.find(e=>String(e.id||``)===r)||n[0];i&&(F=i,I=String(i.note||``),L=!1,Y(e),v.querySelector(`#stop-report-text`)?.focus())})}),v.querySelectorAll(`.pause-item`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.id||``;t&&we(t)})}),v.querySelectorAll(`.edit-toggle`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.id||``;E=E===t?null:t,q()})}),v.querySelector(`#save-edit`)?.addEventListener(`click`,()=>{if(!E)return;let e=v.querySelector(`#edit-note`)?.value??``,t=!!v.querySelector(`#edit-billable`)?.checked,n=v.querySelector(`#edit-desc`);Te(E,{note:e,billable:t,...n?{description:n.value.trim()}:{}})}),v.querySelector(`#open-start`)?.addEventListener(`click`,()=>{T=!0,q()}),v.querySelector(`#close-start`)?.addEventListener(`click`,()=>{T=!1,q()}),v.querySelector(`#mode-switch`)?.addEventListener(`click`,()=>{D=`switch`,q()}),v.querySelector(`#mode-parallel`)?.addEventListener(`click`,()=>{D=`parallel`,q()}),F&&ge(e),A===`tasks`?_e(n,o,e):(p&&De(),ke(i)),Se(u),Ae(o)}function ue(e){let n=N.filter(e=>e.mine).length,r=N.length,i=k===`time`,a=k===`tasks`,o=e=>e?t(`Unpin tab`,`Odopnúť kartu`,`Fül rögzítésének feloldása`):t(`Pin as default tab`,`Pripnúť ako predvolenú kartu`,`Rögzítés alapértelmezett fülként`);return`
    <div class="panel-tabs" role="tablist" aria-label="${b(t(`Panel section`,`Sekcia panela`,`Panel szakasz`))}">
      <div class="panel-tab-wrap ${O===`time`?`active`:``}">
        <button id="tab-time" class="panel-tab" type="button" role="tab" aria-selected="${O===`time`}">
          ${b(t(`Time`,`Čas`,`Idő`))}
          ${e>0?`<span class="tab-badge">${b(e)}</span>`:``}
        </button>
        <button class="pin-btn ${i?`pinned`:``}" type="button" data-pin-tab="time" aria-pressed="${i}" title="${b(o(i))}" aria-label="${b(o(i))}">${re}</button>
      </div>
      <div class="panel-tab-wrap ${O===`tasks`?`active`:``}">
        <button id="tab-tasks" class="panel-tab" type="button" role="tab" aria-selected="${O===`tasks`}">
          ${b(t(`Tasks`,`Úlohy`,`Feladatok`))}
          ${r>0?`<span class="tab-badge">${b(j===`mine`?n:r)}</span>`:``}
        </button>
        <button class="pin-btn ${a?`pinned`:``}" type="button" data-pin-tab="tasks" aria-pressed="${a}" title="${b(o(a))}" aria-label="${b(o(a))}">${re}</button>
      </div>
    </div>`}function de(){let e=M.trim().toLowerCase();return N.filter(t=>j===`mine`&&!t.mine?!1:!e||String(t.title||``).toLowerCase().includes(e)||String(t.projectName||``).toLowerCase().includes(e)||String(t.clientName||``).toLowerCase().includes(e)||String(t.status||``).toLowerCase().includes(e))}function fe(e=0){let t=new Date(Date.now()+e*864e5);return`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,`0`)}-${String(t.getDate()).padStart(2,`0`)}`}function pe(e,n,r,i){let a=n.find(t=>String(t.taskId||``)===String(e.id||``)),o=String(e.deadline||``),s=!!(o&&o<i),c=String(e.priority||``)===`high`,l=[e.projectName||e.clientName,e.status].filter(Boolean),u=o?o.slice(5):``,d=[e.projectName,e.clientName,e.status,o].filter(Boolean).join(` · `);return`
    <div class="task-row ${a?`is-running`:``}">
      <div class="task-row-main">
        <div class="task-row-title" title="${b(e.title||``)}">
          ${c?`<span class="prio-dot" title="${b(t(`High priority`,`Vysoká priorita`,`Magas prioritás`))}"></span>`:``}
          <span class="task-row-title-text">${b(e.title||t(`Untitled task`,`Úloha bez názvu`,`Névtelen feladat`))}</span>
        </div>
        <div class="task-row-sub" title="${b(d)}">
          ${b(l.join(` · `))}${l.length&&u?` · `:``}${u?`<span class="${s?`overdue-text`:``}">${b(u)}</span>`:``}
        </div>
      </div>
      <div class="task-row-acts">
        ${a?`<span class="item-elapsed" data-start="${b(a.startAt)}">0:00:00</span>
             <button class="mini-btn stop stop-task-btn" type="button" data-id="${b(a.id)}" title="${b(t(`Stop`,`Zastaviť`,`Leállítás`))}">${B}</button>`:`<button class="mini-btn play start-task-btn" type="button" data-task-id="${b(e.id)}" data-project-id="${b(e.projectId||``)}" data-title="${b(e.title||``)}" title="${b(t(`Start timer`,`Spustiť časovač`,`Időzítő indítása`))}">${R}</button>`}
        <a class="icon-link" href="${b(r)}/#tasks" target="_blank" rel="noopener" title="${b(t(`Open in CRM`,`Otvoriť v CRM`,`Megnyitás a CRM-ben`))}">↗</a>
      </div>
    </div>`}function X(e,n){let r=de();if(!r.length)return`<p class="muted" style="text-align:center;padding:12px 0">${b(t(`No matching open tasks.`,`Žiadne otvorené úlohy.`,`Nincs nyitott feladat.`))}</p>`;let i=fe(0),a=fe(1),o=[{key:`overdue`,label:t(`Overdue`,`Po termíne`,`Lejárt`),rows:[]},{key:`today`,label:t(`Today`,`Dnes`,`Ma`),rows:[]},{key:`tomorrow`,label:t(`Tomorrow`,`Zajtra`,`Holnap`),rows:[]},{key:`upcoming`,label:t(`Upcoming`,`Nadchádzajúce`,`Közelgő`),rows:[]}];for(let e of r){let t=String(e.deadline||``);t&&t<i?o[0].rows.push(e):t===i?o[1].rows.push(e):t===a?o[2].rows.push(e):o[3].rows.push(e)}let s=o.filter(e=>e.rows.length>0);!ee&&o[0].rows.length===0&&o[1].rows.length===0&&s.length>0&&P.delete(s[0].key);let c=M.trim().length>0;return s.map(t=>{let r=c||!P.has(t.key);return`
        <section class="task-bucket bucket-${t.key}">
          <button class="bucket-head" type="button" data-bucket="${t.key}" aria-expanded="${r}">
            <span class="bucket-head-left">
              <span>${r?`▾`:`▸`}</span>
              <span>${b(t.label)}</span>
            </span>
            <span class="bucket-count">${b(t.rows.length)}</span>
          </button>
          ${r?t.rows.map(t=>pe(t,e,n,i)).join(``):``}
        </section>`}).join(``)}function me(e,n,r){let i=e.length>0&&r.capabilities.parallelAllowed?`<span class="muted">${b(D===`parallel`?t(`Starts in parallel`,`Spustí sa paralelne`,`Párhuzamos indítás`):t(`Switches active timer`,`Prepne aktívny časovač`,`Aktív időzítő cseréje`))}</span>`:``;return`
    <div class="body stack">
      <div class="row">
        <input id="panel-task-search" type="search" value="${b(M)}" placeholder="${b(t(`Search tasks or projects…`,`Hľadať úlohy alebo projekty…`,`Feladat vagy projekt keresése…`))}" autocomplete="off" />
        <button id="refresh-tasks" class="tiny" type="button" title="${b(t(`Refresh`,`Obnoviť`,`Frissítés`))}">↻</button>
      </div>
      <div class="segmented" role="group" aria-label="${b(t(`Task filter`,`Filter úloh`,`Feladatszűrő`))}">
        <button id="filter-mine" class="seg-btn ${j===`mine`?`active`:``}" type="button">${b(t(`My tasks`,`Moje úlohy`,`Feladataim`))}</button>
        <button id="filter-all" class="seg-btn ${j===`all`?`active`:``}" type="button">${b(t(`All open`,`Všetky otvorené`,`Összes nyitott`))}</button>
      </div>
      ${i}
      <div id="tasks-list-body" class="stack">${X(e,n)}</div>
    </div>`}function he(){let e=F?.title||t(`Running timer`,`Bežiaci časovač`,`Futó időzítő`),n=g(I);return`
    <div class="stop-report-card" role="region" aria-label="${b(t(`Work report`,`Report práce`,`Munkajelentés`))}">
      <div class="spread">
        <span class="section-label" style="color:#be123c">${b(t(`Type in what you did!`,`Napíšte, čo ste robili!`,`Írja le, mit csinált!`))}</span>
        <button id="cancel-stop-report" class="tiny" type="button">${b(t(`Cancel`,`Zrušiť`,`Mégse`))}</button>
      </div>
      <span class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b(e)}</span>
      <div class="md-box">
        <div class="md-bar">
          <div class="md-tools">
            ${L?`<span class="muted" style="font-size:10.5px">${b(t(`Preview`,`Náhľad`,`Előnézet`))}</span>`:`
              <button class="md-btn" type="button" data-md="bold" title="${b(t(`Bold (**text**)`,`Tučné (**text**)`,`Félkövér`))}">B</button>
              <button class="md-btn" type="button" data-md="italic" title="${b(t(`Italic (*text*)`,`Kurzíva (*text*)`,`Dőlt`))}"><em>I</em></button>
              <button class="md-btn" type="button" data-md="bullet" title="${b(t(`Bullet list (- item)`,`Odrážky (- položka)`,`Felsorolás`))}">•</button>
              <button class="md-btn" type="button" data-md="code" title="${b(t("Code (`code`)","Kód (`kód`)",`Kód`))}">&lt;/&gt;</button>
            `}
          </div>
          <button id="toggle-stop-preview" class="md-btn ${L?`active`:``}" type="button">${b(L?t(`Edit`,`Upraviť`,`Szerk.`):t(`Preview`,`Náhľad`,`Előnézet`))}</button>
        </div>
        ${L?`<div class="md-preview">${n||`<span class="muted">${b(t(`Nothing to preview.`,`Zatiaľ nič na náhľad.`,`Nincs előnézet.`))}</span>`}</div>`:`<textarea id="stop-report-text" class="md-textarea" maxlength="1000" placeholder="${b(t("What was done? (**bold**, *italic*, - bullets, `code`)","Čo bolo urobené? (**tučné**, *kurzíva*, - odrážky, `kód`)","Mi készült el? (**félkövér**, *dőlt*, - lista, `kód`)"))}">${b(I)}</textarea>`}
      </div>
      <div class="row">
        <button id="confirm-stop-report" class="stop wide" type="button">${B} ${b(I.trim()?t(`Stop & save report`,`Zastaviť a uložiť`,`Leállítás és mentés`):t(`Stop timer`,`Zastaviť časovač`,`Időzítő leállítása`))}</button>
      </div>
    </div>`}function ge(e){let n=v.querySelector(`#stop-report-text`);n?.addEventListener(`input`,()=>{I=n.value;let e=v.querySelector(`#confirm-stop-report`);e&&(e.innerHTML=`${B} ${b(I.trim()?t(`Stop & save report`,`Zastaviť a uložiť`,`Leállítás és mentés`):t(`Stop timer`,`Zastaviť časovač`,`Időzítő leállítása`))}`)}),n?.addEventListener(`keydown`,e=>{(e.metaKey||e.ctrlKey)&&e.key===`Enter`&&(e.preventDefault(),F&&$(F,I))}),v.querySelectorAll(`[data-md]`).forEach(e=>{e.addEventListener(`click`,()=>{if(!n)return;let t=e.dataset.md,r=_(n.value,n.selectionStart??n.value.length,n.selectionEnd??n.value.length,t);n.value=r.value,I=r.value,n.focus(),n.setSelectionRange(r.selectionStart,r.selectionEnd)})}),v.querySelector(`#toggle-stop-preview`)?.addEventListener(`click`,()=>{L=!L,Y(e)}),v.querySelector(`#cancel-stop-report`)?.addEventListener(`click`,()=>{F=null,I=``,L=!1,Y(e)}),v.querySelector(`#confirm-stop-report`)?.addEventListener(`click`,()=>{F&&$(F,I)})}function _e(e,t,n){let r=()=>{v.querySelectorAll(`.bucket-head`).forEach(n=>{n.addEventListener(`click`,()=>{let i=n.dataset.bucket||``;if(!i)return;ee=!0,P.has(i)?P.delete(i):P.add(i);let a=v.querySelector(`#tasks-list-body`);a&&(a.innerHTML=X(e,t),r())})}),v.querySelectorAll(`.start-task-btn`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.taskId||``,n=e.dataset.projectId||``,r=e.dataset.title||``;t&&Q({taskId:t,...n?{projectId:n}:{},description:r})})}),v.querySelectorAll(`.stop-task-btn`).forEach(t=>{t.addEventListener(`click`,()=>{let r=t.dataset.id||``,i=e.find(e=>String(e.id||``)===r)||e[0];i&&(F=i,I=String(i.note||``),L=!1,Y(n),v.querySelector(`#stop-report-text`)?.focus())})})};r();let i=v.querySelector(`#panel-task-search`);i?.addEventListener(`input`,()=>{M=i.value;let n=v.querySelector(`#tasks-list-body`);n&&(n.innerHTML=X(e,t),r())}),v.querySelector(`#filter-mine`)?.addEventListener(`click`,()=>{j=`mine`,q()}),v.querySelector(`#filter-all`)?.addEventListener(`click`,()=>{j=`all`,q()}),v.querySelector(`#refresh-tasks`)?.addEventListener(`click`,()=>{q()})}function ve(e){return`
    <div class="edit-drawer">
      ${!e.taskId&&!e.ticketId?`<input id="edit-desc" value="${b(e.title||``)}" placeholder="${b(t(`Description`,`Popis`,`Leírás`))}" />`:``}
      <input id="edit-note" value="${b(e.note||``)}" placeholder="${b(t(`Add note…`,`Pridať poznámku…`,`Megjegyzés…`))}" />
      <div class="spread">
        <label class="check"><input id="edit-billable" type="checkbox" ${e.billable?`checked`:``} /> ${b(t(`Billable`,`Fakturovateľné`,`Számlázható`))}</label>
        <button id="save-edit" class="tiny primary" type="button" style="color:white">${b(t(`Save`,`Uložiť`,`Mentés`))}</button>
      </div>
    </div>`}function ye(e,n){let r=n.presence;if(!e||!r||r.enabled===!1||r.phase!==`tracking`||!r.promptAt)return``;let i=(n.capabilities.presenceMinutes||50)*6e4,a=Date.parse(r.promptAt)-n.offsetMs,o=Math.max(0,a-Date.now()),s=Math.max(1,Math.ceil(o/6e4)),c=Math.max(5,Math.min(100,Math.round((i-o)/i*100)));return`
    <div class="checkin-bar">
      <div class="spread">
        <span>${b(t(`Next presence check-in`,`Ďalšia kontrola prítomnosti`,`Következő jelenléti ellenőrzés`))}</span>
        <strong>${b(t(`in ${s}m`,`o ${s} min`,`${s} perc múlva`))}</strong>
      </div>
      <div class="checkin-track"><div class="checkin-fill" style="width:${c}%"></div></div>
    </div>`}function be(e){let n=e.presence,r=!!(e.testAlertUntil&&e.testAlertUntil>Date.now());if(n?.phase===`question`&&n.enabled!==!1||r){let e=r?t(`Previewing 50-minute pulse & chime alert.`,`Náhľad 50-minútového pulzného upozornenia.`,`50 perces pulzus és hangjelzés előnézet.`):t(`Confirm before ${o(n?.deadlineAt)} or running timers will pause.`,`Potvrďte do ${o(n?.deadlineAt)}, inak sa časovače pozastavia.`,`Erősítse meg ${o(n?.deadlineAt)}-ig, különben az időzítők leállnak.`);return`
      <div class="question" role="alert">
        <div class="spread"><strong>${b(t(`Still working?`,`Stále pracujete?`,`Még dolgozik?`))}</strong><span class="countdown" id="countdown"></span></div>
        <p class="muted" style="margin:0;color:#92400e">${b(e)}</p>
        <button id="confirm" class="primary wide" type="button">${b(r?t(`Stop alert preview`,`Zastaviť ukážku`,`Előnézet leállítása`):t(`Still working — keep running`,`Áno, pracujem — pokračovať`,`Igen, dolgozom — folytatás`))}</button>
      </div>`}if(n?.phase===`paused`){let r=e.paused.length?t(`resume below or open app`,`obnovte nižšie alebo v aplikácii`,`folytassa alább vagy az alkalmazásban`):t(`open the app to resume`,`obnovte v aplikácii`,`folytassa az alkalmazásban`);return`<div class="paused-banner"><strong>${b(t(`Paused at ${o(n.autoPausedAt)}`,`Pozastavené o ${o(n.autoPausedAt)}`,`Szüneteltetve: ${o(n.autoPausedAt)}`))}</strong> · ${b(r)}</div>`}return``}function xe(e){if(!e.paused.length)return``;let n=e.paused.map((e,n)=>`
    <div class="card spread">
      <span class="grow">${b(e.title||t(`Untitled`,`Bez názvu`,`Névtelen`))}<br /><span class="muted">${b(e.projectName||t(`Unsorted`,`Nezaradené`,`Rendezetlen`))} · ${b(t(`paused ${o(e.pausedAt)}`,`pozastavené ${o(e.pausedAt)}`,`szüneteltetve ${o(e.pausedAt)}`))}</span></span>
      <button class="round small soft resume-item" type="button" data-index="${n}" aria-label="${b(t(`Resume`,`Pokračovať`,`Folytatás`))}" title="${b(t(`Resume`,`Pokračovať`,`Folytatás`))}">${R}</button>
      <button class="round small stop stop-paused" type="button" data-index="${n}" aria-label="${b(t(`Stop`,`Zastaviť`,`Leállítás`))}" title="${b(t(`Stop`,`Zastaviť`,`Leállítás`))}">${B}</button>
    </div>`).join(``);return`<div class="stack"><span class="section-label">${b(t(`Paused`,`Pozastavené`,`Szüneteltetve`))}</span>${n}</div>`}function Se(e){window.clearInterval(S);let t=!!(e.testAlertUntil&&e.testAlertUntil>Date.now()),n=t?e.testAlertUntil:e.presence?.deadlineAt?Date.parse(e.presence.deadlineAt)-e.offsetMs:NaN,r=v.querySelector(`#countdown`);if(r&&Number.isFinite(n)){let e=()=>{let e=n-Date.now();r.textContent=a(e),e<=0&&(window.clearInterval(S),W().then(()=>q()))};e(),S=window.setInterval(e,1e3)}v.querySelector(`#confirm`)?.addEventListener(`click`,async()=>{t?(await chrome.runtime.sendMessage({type:`stop-test-alert`}),await q()):await Ce()}),v.querySelectorAll(`.resume-item`).forEach(t=>{t.addEventListener(`click`,()=>{let n=e.paused[Number(t.dataset.index)];n&&Ee(n)})}),v.querySelectorAll(`.stop-paused`).forEach(t=>{t.addEventListener(`click`,()=>{let n=e.paused[Number(t.dataset.index)];n&&$(n)})})}function Z(e){let t=v.querySelector(`#notice`);t&&(t.innerHTML=`<p class="error">${b(e)}</p>`)}async function Ce(){let e=v.querySelector(`#confirm`);e&&(e.disabled=!0);let a=await c();try{if(await r(a.ccrmUrl,a.deviceKey,`POST`,`confirm`),y){window.close();return}}catch(r){if(r instanceof i&&r.code===`offline`){e&&(e.disabled=!1),Z(t(`Could not reach ${n}. Try again.`,`${n} nie je dostupný. Skúste znova.`,`A ${n} nem érhető el. Próbálja újra.`));return}}await W(),await q()}async function we(e){let t=await c();try{await r(t.ccrmUrl,t.deviceKey,`POST`,`pause`,{id:e})}catch(e){let t=e instanceof i?e.code:`offline`;Z(d(t))}await W(),await q()}async function Te(e,t){let n=await c();try{await r(n.ccrmUrl,n.deviceKey,`POST`,`update`,{id:e,...t}),E=null}catch(e){let t=e instanceof i?e.code:`offline`;Z(d(t))}await W(),await q()}async function Ee(e){let t=await c();try{await r(t.ccrmUrl,t.deviceKey,`POST`,`resume`,{id:e.id,mode:D})}catch(e){let t=e instanceof i?e.code:`offline`;await W(),await q(),t!==`already_running`&&t!==`not_paused`&&Z(d(t));return}await W(),await q()}function De(){let e=``,n=``,i=``,a=``,o=v.querySelector(`#title`),s=v.querySelector(`#project`),l=v.querySelector(`#task-picked`),u=v.querySelector(`#task-list`),d=v.querySelector(`#project-list`),f=()=>{e?(l.hidden=!1,l.innerHTML=`<span class="pill">${b(t(`Task:`,`Úloha:`,`Feladat:`))} ${b(n)} <button id="clear-task" type="button" style="height:auto;padding:0 4px;background:transparent;color:#4a5a20">×</button></span>`,v.querySelector(`#clear-task`)?.addEventListener(`click`,()=>{e=``,n=``,f()})):(l.hidden=!0,l.innerHTML=``)},p=0,m=async l=>{let d=await c();if(d.deviceKey)try{let c=(await r(d.ccrmUrl,d.deviceKey,`GET`,`myTasks`,{},{q:l,...i?{projectId:i}:{}})).tasks||[];if(!c.length){u.innerHTML=``;return}u.innerHTML=c.slice(0,6).map((e,n)=>{let r=[e.projectName,e.clientName].filter(Boolean).join(` · `)||t(`No project`,`Bez projektu`,`Nincs projekt`);return`
            <button class="pick task-pick" type="button" data-idx="${n}">
              <span class="pick-main">
                <span class="pick-title" title="${b(e.title)}">${b(e.title)}</span>
                <span class="pick-sub" title="${b(r)}">${b(r)}</span>
              </span>
              ${e.mine?`<span class="pill">${b(t(`Mine`,`Moja`,`Saját`))}</span>`:``}
            </button>`}).join(``),u.querySelectorAll(`.task-pick`).forEach(t=>{t.addEventListener(`click`,()=>{let r=c[Number(t.dataset.idx)];r&&(e=r.id,n=r.title,o.value=r.title,r.projectId&&(i=r.projectId,a=r.projectName||``,s.value=a),u.innerHTML=``,f())})})}catch{u.innerHTML=``}};o.addEventListener(`focus`,()=>{!u.innerHTML&&!e&&m(o.value.trim())}),o.addEventListener(`input`,()=>{e&&o.value!==n&&(e=``,n=``,f()),window.clearTimeout(p),p=window.setTimeout(()=>void m(o.value.trim()),180)});let h=0;s.addEventListener(`input`,()=>{i=``,a=``,window.clearTimeout(h),h=window.setTimeout(async()=>{let e=await c(),n=await je();try{let c=(await r(e.ccrmUrl,e.deviceKey,`GET`,`projects`,{},{q:s.value,host:n})).projects||[];d.innerHTML=c.slice(0,6).map((e,n)=>`<button class="pick proj-pick" type="button" data-idx="${n}"><span class="dot"></span><span class="pick-main"><span class="pick-title" title="${b(e.name)}">${b(e.name)}</span></span>${e.suggested?`<span class="muted">${b(t(`suggested`,`navrhnuté`,`javasolt`))}</span>`:``}</button>`).join(``),d.querySelectorAll(`.proj-pick`).forEach(e=>{e.addEventListener(`click`,()=>{let t=c[Number(e.dataset.idx)];t&&(i=t.id,a=t.name,s.value=t.name,d.innerHTML=``,m(o.value.trim()))})})}catch{d.innerHTML=``}},180)}),v.querySelector(`#start`)?.addEventListener(`click`,()=>{Q({description:e?``:o.value.trim(),projectId:i,projectName:a,taskId:e,taskTitle:n,mode:D})}),Me((e,t)=>{!s.value&&!i&&(i=e,a=t,s.value=t)})}function Oe(e){if(!e.length)return``;let n=e.slice(0,5).map((e,n)=>`
    <div class="recent-row">
      <span class="grow"><span class="recent-title">${b(e.title||t(`Untitled`,`Bez názvu`,`Névtelen`))}</span><span class="muted">${b(e.projectName||``)}</span></span>
      <button class="round small soft continue" type="button" data-index="${n}" aria-label="${b(t(`Continue`,`Pokračovať`,`Folytatás`))}" title="${b(t(`Continue`,`Pokračovať`,`Folytatás`))}">${R}</button>
    </div>`).join(``);return`<div class="stack"><span class="section-label">${b(t(`Recent`,`Nedávne`,`Legutóbbi`))}</span>${n}</div>`}function ke(e){v.querySelectorAll(`.continue`).forEach(t=>{t.addEventListener(`click`,()=>{let n=e[Number(t.dataset.index)];n&&Q({description:n.titleSource===`entry`?n.title:``,projectId:n.projectId||``,projectName:n.projectName||``,taskId:n.taskId||``,taskTitle:n.titleSource===`task`?n.title:``,ticketId:n.ticketId||``,mode:D})})})}function Ae(e){v.querySelector(`.footer a`)?.addEventListener(`click`,t=>{t.preventDefault(),chrome.tabs.create({url:`${e}/#time-tracking`})})}async function je(){try{if(!await chrome.permissions.contains({permissions:[`tabs`]}))return``;let t=await chrome.tabs.query({active:!0,currentWindow:!0});return e(t?.[0]?.url||``)||``}catch{return``}}async function Me(e){let t=await je();if(!t)return;let n=await c();try{let i=((await r(n.ccrmUrl,n.deviceKey,`GET`,`projects`,{},{q:``,host:t})).projects||[]).find(e=>e.suggested);i&&e(i.id,i.name)}catch{}}async function Q(e){let n=await c(),a=new Date().toISOString(),o={mode:e.mode===`parallel`?`parallel`:`switch`};e.description&&(o.description=e.description),e.projectId&&(o.projectId=e.projectId),e.taskId&&(o.taskId=e.taskId),e.ticketId&&(o.ticketId=e.ticketId);let l={startedAt:a,title:e.description||e.taskTitle||t(`Running`,`Beží`,`Fut`),projectName:e.projectName,taskTitle:e.taskTitle};if(!navigator.onLine)await G({kind:`start`,at:a,body:o},l),T=!1,await q();else try{await r(n.ccrmUrl,n.deviceKey,`POST`,`start`,{...o,startedAt:a}),await s({optimistic:null}),T=!1,await W(),await q()}catch(e){if(e instanceof i&&e.code===`offline`){await G({kind:`start`,at:a,body:o},l),T=!1,await q();return}if(e instanceof i&&e.code===`not_paired`){C=``,await s({deviceKey:``,optimistic:null}),K(t(`Pair this browser again.`,`Spárujte tento prehliadač znova.`,`Párosítsa újra ezt a böngészőt.`));return}if(e instanceof i&&e.code===`already_running`){await s({optimistic:null}),T=!1,await W(),await q();return}let n=v.querySelector(`#form-error`);n&&(n.hidden=!1,n.textContent=e instanceof i?d(e.code):t(`Could not start.`,`Nepodarilo sa spustiť.`,`Az indítás nem sikerült.`))}}async function $(e,n){let a=await c(),o=new Date().toISOString(),l={};if(e?.id&&(l.id=e.id),n!==void 0&&(l.note=n.trim()||null),!navigator.onLine)F=null,I=``,L=!1,await G({kind:`stop`,at:o,body:l},null),await q();else try{await r(a.ccrmUrl,a.deviceKey,`POST`,`stop`,{...l,stoppedAt:o}),await s({optimistic:null}),E=null,F=null,I=``,L=!1,await W(),await q()}catch(e){if(e instanceof i&&e.code===`offline`){await G({kind:`stop`,at:o,body:l},null),await q();return}if(e instanceof i&&e.code===`ambiguous`){await s({optimistic:null}),await q();return}if(e instanceof i&&e.code===`project_required`){let e=v.querySelector(`#notice`);e&&(e.innerHTML=`<p class="error">${b(d(`project_required`))}</p><label>${b(t(`Project id`,`ID projektu`,`Projekt azonosító`))}<input id="stop-project" /></label><button id="stop-retry" class="stop" type="button">${b(t(`Stop`,`Zastaviť`,`Leállítás`))}</button>`),v.querySelector(`#stop-retry`)?.addEventListener(`click`,()=>{l.projectId=v.querySelector(`#stop-project`).value.trim(),r(a.ccrmUrl,a.deviceKey,`POST`,`stop`,{...l,stoppedAt:o}).then(()=>q()).catch(()=>void 0)});return}if(e instanceof i&&e.code===`not_paired`){C=``,await s({deviceKey:``,optimistic:null,lost:[...a.lost,{id:crypto.randomUUID(),kind:`stop`,at:o,body:l}]}),K(t(`Pair this browser again. The stop was kept on this device.`,`Spárujte tento prehliadač znova. Zastavenie zostalo uložené v tomto zariadení.`,`Párosítsa újra ezt a böngészőt. A leállítás ezen az eszközön maradt.`));return}let n=e instanceof i?e.code:`offline`;(n===`not_found`||n===`not_running`)&&(await s({optimistic:null}),await W(),await q()),Z(d(n))}}document.title=t(`${n} Time Tracker`,`${n} Sledovanie času`,`${n} Időkövetés`),q();