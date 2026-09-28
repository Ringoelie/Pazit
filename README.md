# 🦄 Pixel Unicorn

**De garaje a unicornio.** Juego de gestión de startups en pixel art para el navegador, inspirado en los tycoon de empresas tecnológicas. Es un juego original: todo el arte se dibuja con código y no usa recursos de otros juegos.

Empiezas en el garaje de tus padres con $25.000 y una idea. Aceptas contratos para pagar las facturas, contratas talento, lanzas productos, investigas tecnología y compites contra gigantes hasta salir a bolsa... o quebrar en el intento.

## Qué incluye

- **Oficina en pixel art animada**: tu equipo trabaja, se toma cafés, juega al arcade y se va de vacaciones. Siete oficinas, desde el garaje hasta una estación orbital, con zoom y arrastre.
- **Equipo**: 9 perfiles para contratar (desarrollo, diseño, IA, DevOps, PM, marketing, ventas, I+D y RR.HH.), 12 rasgos de personalidad, niveles, ánimo, energía, sueldos, formación y renuncias.
- **Productos**: 11 categorías (medio digital, tienda online, red social, app de citas, SaaS, streaming, videojuego, buscador, neobanco, asistente de IA y metaverso) y 34 funciones con 10 niveles cada una.
- **Economía**: publicidad, suscripciones premium con precio ajustable, comisiones y API. Usuarios, cuota de mercado, satisfacción, bugs, hype y conocimiento de marca.
- **Investigación**: árbol de 29 tecnologías, de "Modelos de negocio" a la AGI.
- **Infraestructura**: nube con autoescalado o racks propios, DevOps y caídas de servicio.
- **Mercado vivo**: competidores que crecen, reaccionan cuando les quitas cuota, cierran o aparecen. Puedes comprarlos.
- **Dinero**: rondas de inversión (business angel → IPO), préstamos, bolsa y bancarrota.
- **Más cosas**: 15 mejoras de oficina, 7 políticas de empresa (semana de 4 días, crunch, copilotos de IA...), 23 eventos aleatorios con decisiones, 15 objetivos, 23 logros, gráficos, sonido chiptune y guardado automático.
- Funciona en **móvil y escritorio**, sin dependencias ni paso de build.

## Jugar en local

Es un sitio estático: basta con servir la carpeta `public/`.

```sh
npm run dev          # python3 -m http.server 8080 --directory public
# o bien
npx wrangler pages dev public
```

Abre http://localhost:8080.

Controles: **Espacio** pausa, **1-3** velocidad, arrastra la oficina para moverte, rueda o pellizco para el zoom y toca a alguien para ver su ficha.

## Pruebas

```sh
npm test
```

Un bot juega varias partidas de 6 años y comprueba que la economía no se rompe: sin valores `NaN`, sin quiebras constantes y con crecimiento real.

## Desplegar en Cloudflare Pages

### Opción A: conectar el repositorio (recomendada)

Cada `git push` se despliega solo.

1. En el panel de Cloudflare, ve a **Workers & Pages** → **Create application** → pestaña **Pages** → **Import an existing Git repository**.
2. Autoriza GitHub y elige este repositorio.
3. Configuración:
   - **Project name**: `pixel-unicorn` (será `pixel-unicorn.pages.dev`; si está cogido, elige otro y cámbialo también en `wrangler.toml`).
   - **Production branch**: la rama donde esté el juego.
   - **Framework preset**: None.
   - **Build command**: vacío.
   - **Build output directory**: `public`.
4. **Save and Deploy**.

### Opción B: subida directa con Wrangler

Necesitas un API token con el permiso *Account → Cloudflare Pages → Edit* y el ID de tu cuenta.

```sh
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler pages project create pixel-unicorn --production-branch main   # solo la primera vez
npm run deploy
```

## Estructura

```
public/
  index.html, style.css, favicon.svg, manifest.webmanifest, _headers
  js/
    data.js     tablas del juego (roles, funciones, investigación...)
    core.js     helpers de estado compartidos
    sim.js      motor: cálculos, acciones y el paso diario (sin DOM)
    events.js   eventos aleatorios con decisiones
    state.js    guardado, exportación e importación
    sprites.js  pixel art dibujado con código y fuente de 3x5 px
    office.js   vista animada de la oficina en canvas
    ui.js       parcheo del DOM, modales, avisos y avatares
    panels.js   contenido de cada pestaña
    audio.js    efectos chiptune con WebAudio
    main.js     bucle del juego, HUD y acciones
tests/
  bot.js        bot que juega solo
  sim.test.js   prueba de varios años de partida
```

La partida se guarda en el `localStorage` del navegador cada semana de juego. Desde el menú (☰) puedes exportarla como código e importarla en otro dispositivo.
