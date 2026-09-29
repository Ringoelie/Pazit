// Plataformas de las que dependes. Las tiendas de apps se quedan una comisión
// de lo que pagan los usuarios del móvil, pueden cambiar sus reglas o
// expulsarte, y la nube puede subir precios. Tú puedes cobrar por la web,
// recurrir, denunciar o negociar.
import { chance, rint, fmtMoney, fmtPct, fmtDate } from './util.js';
import { has, findProduct, notify, news, money } from './core.js';
import { registerMail, sendMail } from './mail.js';
import { legalWinChance } from './world.js';
import { teamPowers, infraStatus } from './sim.js';
import { isHW } from './hw.js';

export const STORES = 'Manzana Store y Robotín Play';
export const CLOUD_NAME = 'Nimbus Cloud';
// Parte de los usuarios que llega por la app móvil.
export const MOBILE_SHARE = 0.55;
const fail = (msg = '') => ({ ok: false, msg });

export const onMobile = (p) => !isHW(p) && !!p.features.mobile;
export const storeBanned = (s, p) => (p.storeBan || 0) > s.day;

// Ingresos anuales aproximados según los últimos 30 días.
function annualRevenue(s) {
  const w = s.rev30 || [];
  return w.length ? (w.reduce((a, b) => a + b, 0) / w.length) * 365 : 0;
}

// Comisión que aplica la tienda: el programa para pequeños desarrolladores
// la deja en el 15% mientras factures menos de 1 millón al año.
export function storeFee(s) {
  return annualRevenue(s) < 1e6 ? Math.min(s.plat.fee, 0.15) : s.plat.fee;
}

// Parte de suscripciones y comisiones que se queda la tienda.
export function storeCut(s, p) {
  if (!onMobile(p)) return 0;
  return MOBILE_SHARE * (s.plat.webpay ? 0.5 : 1) * storeFee(s);
}

// Publicidad perdida en el móvil por la nueva política de rastreo.
export const adsHit = (s, p) => (onMobile(p) && s.plat.adsHit > s.day ? MOBILE_SHARE * 0.35 : 0);

// Si te expulsan de la tienda, la gente del móvil no puede instalar la app.
export const platformDemand = (s, p) => (storeBanned(s, p) ? 1 - MOBILE_SHARE * 0.7 : 1);

// Multiplicador del precio de la nube (subidas y compromiso anual).
export const cloudMult = (s) => s.plat.cloud * (s.plat.commit > s.day ? 0.8 : 1);

export function toggleWebpay(s) {
  if (!has(s, 'webpay')) return fail('Investiga Pagos directos primero.');
  s.plat.webpay = !s.plat.webpay;
  return { ok: true, msg: s.plat.webpay ? '🌐 La mitad de tus usuarios del móvil ya paga por la web.' : 'Todos los pagos vuelven a pasar por la tienda.' };
}

// Sorpresas de las plataformas, una vez al mes.
export function platformsMonth(s) {
  const mobile = s.products.filter((p) => p.launched && onMobile(p));
  if (mobile.length) {
    if (chance(s, 0.05)) {
      const from = s.plat.fee;
      s.plat.fee = from !== 0.3 && chance(s, 0.5) ? 0.3 : chance(s, 0.6) ? 0.35 : 0.25;
      if (s.plat.fee !== from) sendMail(s, 'platFee', { from, to: s.plat.fee });
    }
    if (chance(s, 0.04)) {
      const p = mobile[rint(s, 0, mobile.length - 1)];
      p.hype += 150;
      p.awareness = Math.min(1, p.awareness + 0.03);
      notify(s, `⭐ ${STORES} destacan ${p.name} en portada.`, 'good');
    }
    const free = mobile.filter((p) => !storeBanned(s, p));
    if (free.length && s.plat.webpay && !s.plat.webpayFree && chance(s, 0.08)) {
      const p = free[rint(s, 0, free.length - 1)];
      p.storeBan = s.day + 60;
      sendMail(s, 'platBan', { pid: p.id, why: 'webpay' });
    } else if (free.length && chance(s, 0.015)) {
      const p = free[rint(s, 0, free.length - 1)];
      p.storeBan = s.day + 60;
      sendMail(s, 'platBan', { pid: p.id, why: 'policy' });
    }
    if (!(s.plat.adsHit > s.day) && mobile.some((p) => p.features.ads) && chance(s, 0.03)) {
      s.plat.adsHit = s.day + 180;
      sendMail(s, 'platTracking', {});
    }
  }
  if (s.infra.cloud && infraStatus(s).cloudUnits > 0) {
    if (chance(s, 0.03) && s.plat.cloud < 1.6) {
      const from = s.plat.cloud;
      s.plat.cloud = Math.min(1.6, Math.round(from * 1.2 * 100) / 100);
      sendMail(s, 'platCloud', { from, to: s.plat.cloud });
    } else if (s.plat.cloud > 1 && chance(s, 0.05)) {
      s.plat.cloud = Math.max(1, Math.round(s.plat.cloud * 0.9 * 100) / 100);
      notify(s, `☁️ ${CLOUD_NAME} baja precios por la competencia.`, 'good');
    }
  }
}

registerMail({
  platFee: {
    make: (s, { from, to }) => ({
      from: STORES,
      icon: to > from ? '📈' : '📉',
      subject: `La comisión de las tiendas pasa del ${fmtPct(from)} al ${fmtPct(to)}`,
      body: to > from
        ? `Las tiendas de apps suben su comisión sobre suscripciones y pagos dentro de la app. Afecta a todos tus productos con App móvil.${has(s, 'webpay') ? ' Cobrar por la web reduce el golpe.' : ' Con Pagos directos podrías cobrar por la web.'}`
        : 'La presión de los reguladores obliga a las tiendas a bajar su comisión. Buenas noticias para tus productos con App móvil.',
    }),
  },

  platTracking: {
    make: () => ({
      from: STORES,
      icon: '🙈',
      subject: 'Nueva política de privacidad en el móvil',
      body: 'Ahora la gente debe dar permiso para que las apps la rastreen, y casi nadie lo da. Los anuncios de tus apps rinden un 35% menos en el móvil durante los próximos 6 meses.',
    }),
  },

  platBan: {
    make: (s, { pid, why }) => {
      const p = findProduct(s, pid);
      if (!p) return null;
      const win = legalWinChance(s, 0.3);
      const choices = [
        { label: 'Denunciar por abuso de posición dominante', hint: '30 días fuera; puede que te bajen la comisión al 15% para siempre' },
        { label: 'Recurrir con abogados', hint: `${fmtPct(win)} de volver ya; si pierdes, 30 días fuera` },
      ];
      choices.push(why === 'webpay' ? { label: 'Quitar los pagos por web', hint: 'Vuelves en 3 días' } : { label: 'Cambiar la app y volver a enviarla', hint: '7 días fuera' });
      return {
        from: STORES,
        icon: '⛔',
        subject: `${p.name} expulsada de las tiendas de apps`,
        body: why === 'webpay'
          ? `Dicen que cobrar por la web incumple sus normas. Mientras tanto, nadie puede instalar la app de ${p.name}.`
          : `Una revisión automática dice que ${p.name} incumple sus normas de contenido. Nadie puede instalar la app hasta que se resuelva.`,
        choices,
        days: 7,
      };
    },
    resolve: (s, { pid, why }, i) => {
      const p = findProduct(s, pid);
      if (!p) return 'Ese producto ya no existe.';
      if (i === 0) {
        p.storeBan = s.day + 30;
        if (chance(s, 0.35 + teamPowers(s).legal * 0.05)) {
          s.plat.fee = 0.15;
          s.plat.webpayFree = true;
          news(s, `⚖️ La autoridad de competencia da la razón a ${s.company} frente a las tiendas de apps.`, 'good');
          return 'Ganas la denuncia: comisión del 15% y puedes cobrar por la web sin castigo. Vuelves en 30 días.';
        }
        return 'La denuncia no prospera. Vuelves a la tienda en 30 días.';
      }
      if (i === 1) {
        if (chance(s, legalWinChance(s, 0.3))) {
          p.storeBan = 0;
          s.reputation = Math.min(100, s.reputation + 2);
          return '⚖️ Recurso ganado: vuelves a la tienda hoy mismo.';
        }
        p.storeBan = s.day + 30;
        return 'Recurso perdido: 30 días fuera de la tienda.';
      }
      if (why === 'webpay') {
        s.plat.webpay = false;
        p.storeBan = s.day + 3;
        return 'Quitas los pagos por web. Vuelves en 3 días.';
      }
      p.storeBan = s.day + 7;
      return 'Cambias la app. Vuelves en una semana.';
    },
  },

  platCloud: {
    make: (s, { from, to }) => {
      const bill = infraStatus(s).cloudMonthly;
      return {
        from: CLOUD_NAME,
        icon: '☁️',
        subject: `${CLOUD_NAME} sube sus precios un ${Math.round((to / from - 1) * 100)}%`,
        body: `Tu factura de la nube (unos ${fmtMoney(bill)} al mes) sube. Puedes firmar un compromiso de un año para pagar un 20% menos, o pasar carga a servidores propios.`,
        choices: [
          { label: 'Firmar compromiso de 1 año', hint: `-20% durante un año; pagas 3 meses por adelantado (${fmtMoney(bill * 3)})` },
          { label: 'Negociar con su equipo comercial', hint: 'Tus comerciales pueden rebajar la subida' },
          { label: 'Aceptar la subida' },
        ],
        days: 10,
      };
    },
    resolve: (s, { from, to }, i) => {
      if (i === 0) {
        const pay = infraStatus(s).cloudMonthly * 3;
        if (s.money < pay) return `No tienes ${fmtMoney(pay)} para pagar por adelantado.`;
        money(s, -pay, 'cloud');
        s.plat.commit = s.day + 365;
        return `Compromiso firmado hasta el ${fmtDate(s.plat.commit)}: -20% en la nube.`;
      }
      if (i === 1) {
        if (chance(s, Math.min(0.85, 0.3 + teamPowers(s).sales * 0.08))) {
          s.plat.cloud = Math.round((from + (to - from) * 0.25) * 100) / 100;
          return 'Buena negociación: la subida se queda en una cuarta parte.';
        }
        return 'No ceden ni un céntimo.';
      }
      return 'Aceptas la subida.';
    },
  },
});

// Resumen para la interfaz: comisión mensual que se queda la tienda.
export function storeMonthly(s, productRevenue) {
  let total = 0;
  for (const p of s.products) {
    const cut = storeCut(s, p);
    if (!cut || !p.launched) continue;
    const r = productRevenue(s, p);
    total += ((r.subs + r.tx) / (1 - cut)) * cut * 30;
  }
  return total;
}
