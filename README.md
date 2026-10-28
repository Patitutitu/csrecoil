# Recoil Rhythm · entrenador de control de recoil de CS2

Juego web estilo "de ritmo" para practicar el control de spray de los rifles de CS2 sin disparos ni objetivos: un láser recorre la trayectoria de compensación con la **cadencia real del arma**, vos la seguís con el mouse y cada bala se califica por el error angular entre tu mira y el punto ideal.

- **La cadencia es sagrada.** La AK-47 dispara cada 100 ms (600 RPM), la M4A4 cada 90 ms (667 RPM), la SG 553 cada 110 ms (545 RPM)... No hay modo lento ni ajuste de velocidad: el ritmo se adapta al arma, no al revés.
- **Todo se mide en grados.** Los patrones son offsets angulares por bala (pitch/yaw). Con tu sensibilidad de CS2 (`sens × 0.022°` por count) el movimiento que hacés en el mousepad es exactamente el que harías en el juego.

## Cómo correrlo

```bash
npm install
npm run dev        # http://127.0.0.1:4873
```

Otros comandos: `npm run build` (producción en `dist/`), `npm run preview`, `npm test` (Vitest), `npm run lint`.

Requiere un navegador de escritorio con mouse. Chrome/Edge usan `pointerrawupdate` y `unadjustedMovement` para leer el mouse sin aceleración del sistema; Firefox/Safari funcionan con los eventos estándar.

## Cómo se juega

1. Elegí arma (rifles, subfusiles o M249; `1`–`9` para las primeras), ejercicio (`Q` 4 balas, `W` 9 balas, `E` cargador completo) y nivel de guía (`G`: Guiado → Fade → Ciego).
2. Click en el área de juego para capturar el mouse. En **Ajustes** cargá tu sensibilidad y DPI reales.
3. Mantené el click izquierdo: la primera bala sale al instante y el resto a la cadencia del arma. Seguí el láser con la mira; soltá para cortar la ráfaga como en el juego.
4. Cada bala recibe **Perfecto (≤ 0,3°) / Genial (≤ 0,6°) / Bien (≤ 1,0°) / Fallo**, con combo que multiplica hasta x2. Al terminar ves tu recorrido superpuesto al ideal, el error por bala y la nota (S/A/B/C/D).
5. `R` repite, `M` silencia, `Espacio` reproduce el ritmo del arma sin jugar.

Niveles de guía:

- **Guiado**: camino completo, nodos numerados y láser visibles toda la ráfaga.
- **Fade**: la guía se apaga durante el primer tramo de la ráfaga; el resto va de memoria.
- **Ciego**: solo el metrónomo y las calificaciones; el patrón se revela al final.

El historial y las estadísticas por bala se guardan en `localStorage` del navegador. No hay backend ni cuentas.

## Estructura

```
src/
  data/weapons.ts        patrones y cadencia por arma (grados)
  engine/types.ts        tipos compartidos
  engine/sprayEngine.ts  línea de tiempo de la ráfaga, muestreo del mouse y calificación por bala
  engine/scoring.ts      umbrales, puntos, combo y nota
  engine/audio.ts        metrónomo con Web Audio (agendado en el reloj de audio), hit sounds, bombo
  engine/render.ts       dibujo del canvas: camino, láser, pulsos, mira, HUD, overlay de resultados
  lib/units.ts           grados ↔ counts ↔ cm, BPM equivalente, trayectoria de compensación
  store/storage.ts       ajustes, historial y estadísticas en localStorage
  components/            PlayArea (canvas + pointer lock), Controls, WeaponInfo, ResultsPanel, StatsPanel, SettingsDialog
```

## Datos

`src/data/weapons.ts` contiene, por arma, `rpm`, `cycleMs` (intervalo real entre balas), `magazine` y `pattern`: un vector por bala con `x` = yaw del impacto en grados (positivo = derecha) e `y` = pitch en grados (positivo = arriba). La trayectoria ideal del mouse es el vector opuesto.

| Arma | RPM | ms/bala | Cargador | Origen del patrón |
| --- | --- | --- | --- | --- |
| AK-47 | 600 | 100 | 30 | Impactos por bala del GIF *AK-47-Spray* de BloodyCase, escalados a la subida medida de 11,18° |
| M4A4 | 667 | 90 | 30 | Medición por bala en grados de imbaboost (2026-10-09) |
| M4A1-S | 600 | 100 | 20 | Medición por bala en grados de imbaboost (2026-10-09) |
| Galil AR | 667 | 90 | 35 | Artanis-RCS en unidades absolutas |
| FAMAS | 667 | 90 | 25 | Artanis-RCS en unidades absolutas |
| SG 553 | 545 | 110 | 30 | Artanis-RCS en unidades absolutas |
| AUG | 600 | 100 | 30 | Artanis-RCS en unidades absolutas |
| MAC-10 | 800 | 75 | 30 | Artanis-RCS en unidades absolutas |
| MP9 | 857 | 70 | 30 | Artanis-RCS en unidades absolutas |
| MP7 | 750 | 80 | 30 | Artanis-RCS en unidades absolutas |
| UMP-45 | 667 | 90 | 25 | Artanis-RCS en unidades absolutas |
| P90 | 857 | 70 | 50 | Artanis-RCS en unidades absolutas |
| PP-Bizon | 750 | 80 | 64 | Artanis-RCS en unidades absolutas |
| M249 | 750 | 80 | 100 | Artanis-RCS en unidades absolutas |

Validación cruzada:

- **AK-47**: escalando solo la altura, el ancho da 7,09° (csstats publica 7,14°). Invertido en ambos ejes coincide con el GIF *AK-47-Recoil* de la misma fuente con ~0,24° de error medio.
- **Artanis-RCS** guarda los patrones en unidades fijas: en las 10 armas con altura publicada da 0,0506° por unidad (±2 %), así que se convierte a grados con una sola constante. Contra la medición en grados de imbaboost, Artanis tiene 0,14–0,19° de error medio por bala.
- **Leetify** (recorridos de compensación de las 16 variantes, en `recoils.zip`) se usa para validar la forma. Reescala cada GIF para que el patrón entre en el cuadro y su punto llega ~120 ms después del contador; muestreado con ese desfase queda a 0,3–0,4° de la medición en M4A4 y M4A1-S, peor que Artanis, por eso no es la fuente principal. Contra Artanis coincide dentro de 0,4–0,8° de media en rifles y subfusiles de cargador corto; P90, PP-Bizon y M249 se separan más en el final de cargadores largos.
- La cadencia y el cargador de cada arma son los valores oficiales de CS2.

Si Valve ajusta un patrón, basta con reemplazar el vector del arma en ese archivo.

## Fuera de alcance (por ahora)

Modo lento (a propósito), objetivos/disparos, multijugador, backend, variantes con mira (AUG/SG 553) y M4A1-S sin silenciador: no hay una fuente en grados para esos patrones.
