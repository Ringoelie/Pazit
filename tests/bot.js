// Bot sencillo que juega solo. Lo usan las pruebas del motor para comprobar
// que la economía aguanta varios años de partida.
import * as G from '../public/js/sim.js';
import { FEATURES, CATEGORIES, RESEARCH, OFFICES, PERKS, CAMPAIGNS, REGIONS } from '../public/js/data.js';
import { pendingMail, answerMail } from '../public/js/mail.js';
import { openRegion, complianceIssues } from '../public/js/world.js';
import { isHW, orderUnits, incoming, unitCost } from '../public/js/hw.js';

export function botDay(s) {
  // Eventos: primera opción salvo vender la empresa.
  if (s.event) G.resolveEvent(s, s.event.id === 'buyout' ? 0 : 0);
  // Correo: primera opción, salvo antimonopolio (colaborar).
  for (const m of pendingMail(s)) answerMail(s, m.id, m.type === 'antitrust' ? m.choices.length - 1 : 0);
  // Sedes internacionales cuando sobra el dinero.
  for (const id of ['latam', 'na', 'africa', 'asia']) {
    if (s.regions[id] == null && s.money > REGIONS[id].open * 12) {
      openRegion(s, id);
      break;
    }
  }
  // Hardware: mantener stock para unos 60 días.
  for (const p of s.products) {
    if (!isHW(p) || !G.coreDone(p)) continue;
    const need = Math.max(p.launched ? p.demand * 60 : 2000, 1000) - p.stock - incoming(p);
    const qty = Math.ceil(need / 1000) * 1000;
    if (qty > 0 && qty * unitCost(s, p) < s.money * 0.4) orderUnits(s, p.id, qty);
  }

  // Contratos mientras no haya ingresos recurrentes fuertes.
  const m = G.mrr(s);
  if (m <= G.payroll(s) && s.contracts.active.length < 2 && s.contracts.offers.length) {
    G.acceptContract(s, s.contracts.offers[0].id);
  }

  // Investigación: la más barata disponible.
  const avail = RESEARCH.filter((r) => G.researchState(s, r) === 'available').sort((a, b) => a.cost - b.cost);
  if (avail[0] && s.rp >= avail[0].cost) G.doResearch(s, avail[0].id);

  // Productos: uno por categoría desbloqueada, priorizando mercados grandes.
  const cats = Object.keys(CATEGORIES).filter((c) => G.categoryUnlocked(s, c) && !s.products.some((p) => p.cat === c));
  const makers = s.employees.filter((e) => ['dev', 'design', 'ai', 'founder'].includes(e.role)).length;
  if (cats.length && s.products.length < Math.min(5, 1 + Math.floor(makers / 4)) && s.day > 20) {
    cats.sort((a, b) => CATEGORIES[b].market - CATEGORIES[a].market);
    G.createProduct(s, '', s.products.length ? cats[0] : 'blog');
  }

  for (const p of s.products) {
    if (!p.launched && G.coreDone(p)) G.launch(s, p.id);
    for (const law of complianceIssues(s, p)) if (!p.queue.some((q) => q.f === law.require)) G.queueFeature(s, p.id, law.require);
    if (p.features.ads && !p.ads) G.toggleAds(s, p.id);
    if (p.queue.length < 2) {
      const opts = Object.keys(CATEGORIES[p.cat].features)
        .filter((f) => G.featureUnlocked(s, f) && G.queuedLevel(p, f) < 10)
        .map((f) => {
          const lvl = G.queuedLevel(p, f) + 1;
          const w = CATEGORIES[p.cat].features[f];
          const value = Math.max(0.5, FEATURES[f].appeal * w) + (FEATURES[f].monet ? 8 : 0) + (FEATURES[f].market ? 10 : 0);
          return { f, score: value / G.costTotal(G.featureCost(f, lvl)) };
        })
        .sort((a, b) => b.score - a.score);
      if (opts[0]) G.queueFeature(s, p.id, opts[0].f);
    }
  }

  // Contratación.
  const cost = G.monthlyCosts(s).total;
  const runway = s.money - cost * 4;
  if (runway > 0 && s.candidates.length) {
    const count = (r) => s.employees.filter((e) => e.role === r).length;
    const wants = [];
    if (count('research') < 1 + Math.floor(s.employees.length / 8)) wants.push('research');
    if (count('design') * 2 < count('dev') + 1) wants.push('design');
    if (G.roleUnlocked(s, 'ai') && count('ai') < count('dev') / 3) wants.push('ai');
    if (G.roleUnlocked(s, 'devops') && count('devops') * 6 < s.infra.racks) wants.push('devops');
    if (G.roleUnlocked(s, 'sales') && count('sales') < s.employees.length / 10) wants.push('sales');
    if (G.roleUnlocked(s, 'pm') && count('pm') < s.products.length) wants.push('pm');
    if (G.roleUnlocked(s, 'legal') && count('legal') < 1 + Math.floor(s.employees.length / 50)) wants.push('legal');
    if (count('marketer') < s.products.filter((p) => p.launched).length) wants.push('marketer');
    wants.push('dev');
    for (const role of wants) {
      const c = s.candidates.filter((x) => x.role === role).sort((a, b) => b.skill / b.salary - a.skill / a.salary)[0];
      if (c && c.salary * 6 < runway) {
        const r = G.hire(s, c.id);
        if (r.ok) break;
      }
    }
  }

  // Reparto: el que no tenga tarea va al producto con más cola o a contratos.
  for (const e of s.employees) {
    if (e.assign && e.assign.startsWith('c:') && !s.contracts.active.some((c) => 'c:' + c.id === e.assign)) e.assign = null;
    if (e.assign) continue;
    if (['dev', 'design', 'ai', 'founder'].includes(e.role)) {
      const c = s.contracts.active[0];
      const p = [...s.products].sort((a, b) => b.queue.length - a.queue.length)[0];
      if (c && (e.role === 'founder' || !p)) e.assign = 'c:' + c.id;
      else if (p) e.assign = 'p:' + p.id;
      else if (e.role === 'founder') e.assign = 'rd';
    } else if (e.role === 'marketer' || e.role === 'pm') {
      const p = s.products.find((x) => x.launched) || s.products[0];
      if (p) e.assign = 'p:' + p.id;
    }
  }
  // Los desarrolladores se reparten entre productos.
  if (s.products.length > 1 && s.day % 30 === 0) {
    const devs = s.employees.filter((e) => ['dev', 'design', 'ai'].includes(e.role) && e.assign?.startsWith('p:'));
    devs.forEach((e, i) => (e.assign = 'p:' + s.products[i % s.products.length].id));
  }

  // Oficina.
  const next = OFFICES[s.office.tier + 1];
  if (next && G.freeDesks(s) <= 0 && s.money > next.move * 2 + next.rent * 6 && (!next.research || G.has(s, next.research))) {
    G.moveOffice(s, s.office.tier + 1);
  }
  for (const id of ['coffee', 'plant', 'whiteboard', 'sofa', 'snacks', 'ac', 'arcade', 'library', 'gym', 'nappods']) {
    if (G.perkState(s, id).ok && s.money > PERKS[id].cost * 10) G.buyPerk(s, id);
  }

  // Infraestructura: racks para cubrir el 60% de la carga si sobra dinero.
  const inf = G.infraStatus(s);
  if (G.has(s, 'cloud') && inf.load * 0.6 > inf.cap && s.money > G.RACK_COST * 20) G.buyRacks(s, 5);

  // Marketing.
  for (const p of s.products) {
    if (p.launched && !p.launchHunt) G.runCampaign(s, p.id, 'launchhunt');
    const best = [...CAMPAIGNS].reverse().find((c) => !c.instant && c.cost * 15 < s.money);
    if (best && p.launched && G.campaignState(s, p, best).ok) G.runCampaign(s, p.id, best.id);
  }

  // Inversores: aceptar siempre.
  if (s.funding.offer) G.acceptOffer(s);
  // Préstamo de emergencia.
  if (s.money < 0 && s.loans.length < 3 && G.loanLimit(s) > 0) G.takeLoan(s, G.loanLimit(s));
}
