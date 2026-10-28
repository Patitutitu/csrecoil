# Recoil Rhythm · entrenador de control de recoil de CS2

Juego web estilo "de ritmo" para practicar el control de spray de CS2 con la **cadencia real del arma**. Tres minijuegos basados en reglas del juego: Spray, Spray Transfer y Strafe A/D (estilo Guitar Hero).

- **La cadencia es sagrada.** La AK-47 dispara cada 100 ms (600 RPM), la M4A4 cada 90 ms (667 RPM)... No hay modo lento: el ritmo se adapta al arma.
- **Todo se mide en grados.** Con tu sensibilidad de CS2 (`sens × 0.022°` por count) el movimiento del mousepad es el mismo que en el juego.
- **Disparar en movimiento falla.** Por encima del 34 % de la velocidad máxima del arma aparece dispersión (como en CS2). Frená con counter-strafe (tecla opuesta) antes de tirar.

## Cómo correrlo

```bash
npm install
npm run dev        # http://127.0.0.1:4873
```

Otros comandos: `npm run build` (producción en `dist/`), `npm run preview`, `npm test` (Vitest), `npm run lint`.

Requiere un navegador de escritorio con mouse. Chrome/Edge usan `pointerrawupdate` y `unadjustedMovement` para leer el mouse sin aceleración del sistema; Firefox/Safari funcionan con los eventos estándar.

## Cómo se juega

1. Elegí **minijuego** (`Tab`), arma (`1`–`9`), ejercicio (`Q`/`W`/`E`) y guía (`G`).
2. Click para capturar el mouse. **Click derecho** (o Esc) lo libera. En Ajustes cargá tu sens y DPI.
3. **Spray**: mantené click izquierdo y seguí el láser. Cada bala perfecta en el instante del disparo pega en (0,0).
4. **Transfer**: 4 impactos al pecho por objetivo en línea (`y = 0`). Mové en X sin perder altura.
5. **Strafe**: partitura A/D (notas sostenidas) + ventanas FIRE. Solo dispará quieto (≤34 % velocidad).
6. El panel **Coach** te dice si bajás muy rápido/lento, el sesgo en cm/counts y en qué tramo fallás.
7. Desafío diario (mismo seed para todos), racha, CS Practice Rating, fantasma del récord y calentamiento de 60 s.

Atajos: `R` reinicia · `M` mute · `Espacio` preview · `A`/`D` strafe · click derecho libera.

## Estructura

```
src/
  data/weapons.ts          patrones, cadencia y maxSpeed por arma
  engine/sprayEngine.ts    ráfaga, impactos en el mundo, transfer, dispersión por movimiento
  engine/strafeEngine.ts   partitura A/D + ventanas de disparo quieto
  engine/movement.ts       física Source (friction/accelerate) a 64 tick
  engine/coach.ts          timing, sesgos y tips en cm/counts
  engine/rating.ts         CS Practice Rating, racha, tiers
  engine/render.ts         spray, objetivos, highway tipo Guitar Hero
  lib/strafeChart.ts       notas AAAAAAAAA / DDDDDDDDD
  lib/transfer.ts          hitboxes de pecho/cabeza y seeds de objetivos
  components/              PlayArea, Controls, ResultsPanel (Coach), MetaPanel, …
```

## Datos

`src/data/weapons.ts` contiene, por arma, `rpm`, `cycleMs` (intervalo real entre balas), `magazine` y `pattern`: un vector por bala con `x` = yaw del impacto en grados (positivo = derecha) e `y` = pitch en grados (positivo = arriba). La trayectoria ideal del mouse es el vector opuesto.

| Arma | RPM | ms/bala | Cargador | Origen del patrón |
| --- | --- | --- | --- | --- |
| AK-47 | 600 | 100 | 30 | Video grabado en CS2 (medido por bala) |
| M4A4 | 667 | 90 | 30 | Video grabado en CS2 (medido por bala) |
| M4A1-S | 600 | 100 | 20 | Video grabado en CS2 (medido por bala) |
| Galil AR | 667 | 90 | 35 | Video grabado en CS2 (medido por bala) |
| FAMAS | 667 | 90 | 25 | Video grabado en CS2 (medido por bala) |
| SG 553 | 545 | 110 | 30 | Artanis-RCS en unidades absolutas |
| AUG | 600 | 100 | 30 | Video grabado en CS2 (medido por bala) |
| MAC-10 | 800 | 75 | 30 | Video grabado en CS2 (medido por bala) |
| MP9 | 857 | 70 | 30 | Video grabado en CS2 (medido por bala) |
| MP7 | 750 | 80 | 30 | Artanis-RCS en unidades absolutas |
| UMP-45 | 667 | 90 | 25 | Artanis-RCS en unidades absolutas |
| P90 | 857 | 70 | 50 | Artanis-RCS en unidades absolutas |
| PP-Bizon | 750 | 80 | 64 | Artanis-RCS en unidades absolutas |
| M249 | 750 | 80 | 100 | Artanis-RCS en unidades absolutas |

Cómo se midieron los videos (mapa Recoil Master, 1600x900 a 60 fps, disparando sin mover el mouse, con *recoil crosshair* activado):

- La mira de recoil verde marca la dirección de cada bala sin la dispersión aleatoria. La vista también se mueve (view punch), así que la rotación de la cámara se resuelve en 3D con dos referencias fijas de la pared. La focal de 600 px (FOV horizontal de 106,26° en 16:9) se confirmó ajustándola: el residuo es de menos de 0,2 px.
- Los disparos se detectan por el salto de la cámara. La grilla encaja con la cadencia oficial en todas las armas (AK, AUG y M4A1-S 100 ms; FAMAS, Galil y M4A4 90 ms; MAC-10 75 ms; MP9 70 ms). Cada bala se mide en el último frame antes del disparo siguiente.
- Contra los impactos reales en la pared, el desvío medio es de ±0,2°, que es la dispersión normal, así que no hay sesgo sistemático.
- AUG con mira: en el visor (focal de 1448 px, FOV de 45°) la cadencia también es de 100 ms y el patrón coincide con el del AUG sin mira, a 0,4° de media. Por eso no se agregó una variante aparte.
- Diferencias con las fuentes anteriores: los patrones son entre 3 y 7 % más altos (AK 11,76° frente a 11,18°). Además, imbaboost tenía la M4A4 y la M4A1-S corridas una bala.

Validación cruzada de las armas que no tienen video:

- **Artanis-RCS** guarda los patrones en unidades fijas: en las 10 armas con altura publicada da 0,0506° por unidad (±2 %), así que se convierte a grados con una sola constante. Contra la medición en grados de imbaboost, Artanis tiene 0,14–0,19° de error medio por bala.
- **Leetify** (recorridos de compensación de las 16 variantes, en `recoils.zip`) se usa para validar la forma. Reescala cada GIF para que el patrón entre en el cuadro y su punto llega ~120 ms después del contador; muestreado con ese desfase queda a 0,3–0,4° de la medición en M4A4 y M4A1-S, peor que Artanis, por eso no es la fuente principal. Contra Artanis coincide dentro de 0,4–0,8° de media en rifles y subfusiles de cargador corto; P90, PP-Bizon y M249 se separan más en el final de cargadores largos.
- La cadencia y el cargador de cada arma son los valores oficiales de CS2.

Si Valve ajusta un patrón, basta con reemplazar el vector del arma en ese archivo.

## Fuera de alcance (por ahora)

Modo lento (a propósito), multijugador online, backend, cuentas, la SG 553 con mira y M4A1-S sin silenciador.
