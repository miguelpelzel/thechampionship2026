# Notificaciones push — guía de configuración

> **Este archivo está en un repositorio público.** No escribas acá la clave
> privada VAPID ni el `SEND_TOKEN`. Los valores reales viven únicamente como
> variables de tipo **Secret** en Cloudflare, y en el llavero de tu teléfono.
> Si alguna vez quedaron escritos acá, hay que rotarlos: ver "Rotar las claves"
> al final.

Todo el código ya está en la app. Falta una sola cosa: publicar el Worker que
entrega las notificaciones, y pegar su dirección en el `index.html`.

Son unos 15 minutos, una sola vez.

---

## Tus claves

Ya están generadas. La pública va en la app (no es secreta). La privada va
solo en Cloudflare — **no la compartas ni la subas a GitHub**.

```
VAPID_PUBLIC   BJSzKKb2EB5GULhOWcAgz88RiV0Ik-ZnPKS0sWUvDKNkMDeE-mJ5Hxf27y4oeGhOigicmtAHKiRohsF2upI1kRw

VAPID_PRIVATE  <<PEGAR_LA_CLAVE_PRIVADA_AQUI>>
```

---

## Paso 1 — Crear el Worker en Cloudflare

1. Entrá a **dash.cloudflare.com** y creá una cuenta gratuita. No pide tarjeta.
2. En el menú lateral: **Workers & Pages** → **Create** → **Start with Hello World!**
3. Ponele de nombre `championship-push` y dale **Deploy**.
4. Clic en **Edit code**. Borrá todo lo que haya y pegá el contenido del
   archivo `worker.js` (viene en el ZIP). Dale **Deploy** otra vez.

Cuando termine vas a ver una dirección parecida a:

```
https://championship-push.TU-USUARIO.workers.dev
```

**Copiala, la necesitás en el paso 3.**

## Paso 2 — Cargar las variables secretas

En la pantalla del Worker: **Settings** → **Variables and Secrets** → **Add**.

Agregá estas cuatro. Las dos marcadas como *Secret* elegilas con el tipo
**Secret**, no **Text**:

| Nombre          | Tipo   | Valor |
|-----------------|--------|-------|
| `VAPID_PUBLIC`  | Text   | `BJSzKKb2EB5GULhOWcAgz88RiV0Ik-ZnPKS0sWUvDKNkMDeE-mJ5Hxf27y4oeGhOigicmtAHKiRohsF2upI1kRw` |
| `VAPID_PRIVATE` | Secret | `<<PEGAR_LA_CLAVE_PRIVADA_AQUI>>` |
| `VAPID_SUBJECT` | Text   | `mailto:miguel.pelzel@gmail.com` |
| `SEND_TOKEN`    | Secret | inventá una clave larga y guardala en tu gestor de contraseñas |

Guardá y dale **Deploy** de nuevo para que tomen efecto.

El `SEND_TOKEN` es lo que impide que cualquiera mande notificaciones en tu
nombre. **Anotalo**, lo vas a cargar una vez en tu teléfono.

## Paso 3 — Pegar la dirección en la app

Abrí `index.html` y buscá esta línea (está cerca del comentario
`NOTIFICACIONES PUSH`):

```js
var PUSH_WORKER_URL = '';
```

Poné adentro la dirección del paso 1:

```js
var PUSH_WORKER_URL = 'https://championship-push.TU-USUARIO.workers.dev';
```

Subí la versión con el deploy de siempre.

## Paso 4 — Permisos de Firestore

Las suscripciones se guardan en dos colecciones nuevas, `push_subs` y
`push_sent`. Si tenés reglas de Firestore restrictivas, habilitá lectura y
escritura para esas dos. Si hoy está todo abierto, no tenés que tocar nada.

## Paso 5 — Cargar la clave en tu teléfono

Una sola vez, en el dispositivo desde el que cargás resultados:

1. Abrí la app y activá el **modo admin** (doble toque en "The Championship
   2026", abajo de todo en la pantalla de inicio).
2. Entrá a **Etapa 4 → Cuadros**. Arriba, al lado de los botones de PDF, van a
   aparecer dos botones nuevos: **🔑** y **🔔**.
3. Tocá **🔑** y pegá el `SEND_TOKEN`.

Esa clave queda guardada solo en ese teléfono. Sin ella, el dispositivo no
envía notificaciones — por eso no sirve de nada que alguien vea el código.

---

## Probar antes de abrirlo a todos

1. En tu iPhone, abrí la web en Safari.
2. Tocá **Compartir** → **Agregar a pantalla de inicio**.
3. Abrí la app **desde el ícono nuevo**, no desde Safari.
4. En la pantalla de inicio, tocá **Activar notificaciones** y elegí tu nombre.
5. Aceptá el permiso que pide iOS.
6. Activá el modo admin, andá a Etapa 4 → Cuadros y tocá **🔔**.

Si llega la notificación de prueba, está todo bien.

Después probá el caso real: cargá el resultado de un 32vos cuyo ganador
complete un cruce de 16vos, y fijate que llegue el aviso.

---

## Cómo lo ve un jugador

1. Abre la web en Safari.
2. Compartir → Agregar a pantalla de inicio.
3. Abre la app desde el ícono.
4. Toca "Activar notificaciones" y elige su nombre de la lista.
5. Acepta el permiso.

Listo, no toca nada más. Cuando queda definido su próximo rival le llega:

> **🎾 THE CHAMPIONSHIP 2026**
> ¡Ya tenés rival! Tu próximo partido es contra Felipe Paullier.
> Categoría A · Cuartos de final · Etapa 4

Al tocarla se abre la app.

---

## Cosas que conviene saber

**Solo funciona si agregaron la app a la pantalla de inicio.** Es una
restricción de Apple, no del código. Abierta en Safari no hay notificaciones.
La app lo detecta y, en ese caso, muestra las instrucciones en vez del botón.

**Hace falta iOS 16.4 o más nuevo.** Teléfonos más viejos no lo soportan.

**En Android funciona igual**, y sin necesidad de instalar.

**No se duplican.** Cada cruce se marca como avisado en `push_sent`. Si volvés
a guardar el mismo resultado, no se reenvía.

**Las correcciones sí vuelven a avisar.** Si borrás o cambiás un resultado y
eso arma un cruce distinto, se manda un aviso nuevo que empieza con
"Corrección de cruce".

**Un jugador puede usar varios dispositivos.** Cada uno guarda su propia
suscripción y recibe el aviso.

**Cualquiera puede elegir cualquier nombre.** Lo decidimos así para que sea
simple. Si alguna vez molesta, se puede agregar un PIN por jugador.

**El caché no cambió.** El service worker nuevo no intercepta la navegación ni
guarda nada, así que la app sigue cargando siempre la última versión, igual
que antes.

---

## Si algo no anda

**No aparece el botón de activar:** la app no está abierta desde el ícono de
la pantalla de inicio.

**El botón 🔔 de prueba dice "Enviados: 0":** revisá que el `SEND_TOKEN` del
teléfono sea idéntico al de Cloudflare, y que las cuatro variables estén
cargadas y el Worker redesplegado después de agregarlas.

**Error 401:** el token no coincide. Tocá 🔑 y cargalo de nuevo.

**Error 403 o 404 del servicio de Apple:** la suscripción caducó. El jugador
tiene que desactivar y volver a activar.

**Nunca llega nada en iPhone pero sí en Android:** casi siempre es que la app
se abrió desde Safari y no desde el ícono.

---

## Rotar las claves

Si la clave privada VAPID o el `SEND_TOKEN` quedaron expuestos (por ejemplo,
escritos en un archivo que se subió al repositorio), hay que reemplazarlos.
Borrarlos del archivo no alcanza: quedan en el historial de Git para siempre.

**Rotar el `SEND_TOKEN`** — 2 minutos, no afecta a ningún jugador:

1. En Cloudflare, Worker → Settings → Variables and Secrets → editar
   `SEND_TOKEN` con un valor nuevo y largo. Deploy.
2. En tu teléfono, modo admin → Etapa 4 → Cuadros → 🔑 y pegar el valor nuevo.

**Rotar las claves VAPID** — hace que todos los jugadores tengan que volver a
activar las notificaciones, así que conviene avisarles antes:

1. Generar un par nuevo (cualquier generador de claves VAPID sirve).
2. En Cloudflare, reemplazar `VAPID_PUBLIC` y `VAPID_PRIVATE`. Deploy.
3. En `index.html`, poner la pública nueva en `PUSH_VAPID_PUBLIC`. Subir la versión.
4. Vaciar la colección `push_subs` en Firestore: las suscripciones viejas
   quedan firmadas con la clave anterior y ya no sirven.
5. Avisar a los jugadores que vuelvan a tocar "Activar notificaciones".
