# AntiSocial Ticket Bot (Components V2 / Embed V2)

Bot de tickets profesional para **AntiSocial**, desarrollado con la última tecnología de Discord **Components V2 (Containers / Embed V2)**, donde el banner, los textos explicativos, los botones de acción rápida y el menú desplegable se encuentran completamente integrados dentro del contenedor de acento rojo.

---

## 🚀 Características Principales

- **Diseño Components V2 (Tipo Container):**
  - Barra de acento lateral roja (`#ED4245` / AntiSocial Red).
  - Banner oficial `assets/banner.jpg` (copiado desde tus descargas).
  - Bloque explicativo con formato de pasos ordenados.
  - Separador horizontal de interfaz.
  - Descripciones limpias de cada categoría (sin emojis por ahora, listo para añadirlos cuando los subas a tu servidor).
  - **5 Botones integrados dentro del panel:**
    - `POSTULAR` (Rojo / Danger)
    - `Partner` (Gris / Secondary)
    - `PREGUNTAS` (Rojo / Danger)
    - `WAGER` (Rojo / Danger)
    - `BUY/COMPRAR` (Verde / Success)
  - **Menú desplegable (Select Menu) completo dentro del contenedor:**
    - Postulación, Partner, Preguntas, Wager, Comprar, Soporte y Reportes.
  - Pie de página oficial: `-# © AntiSocial - ESTO ES ANTISOCIAL UNA SOLA FAMILIA`.

- **Sistema Integral de Tickets:**
  - Creación automática de la categoría `TICKETS ANTISOCIAL` y canales privados con permisos estrictos.
  - Formularios emergentes (Modals) adaptados para cada categoría.
  - Panel interno en el ticket con botones: **Cerrar**, **Reclamar**, **Transcripción** y **Añadir Miembro**.
  - Transcripciones automáticas en formato HTML (`discord-html-transcripts`).
  - Envío automático de logs y transcripciones al canal `🔨┃close-tickets` (`1379662712841306243`) y por mensaje privado (DM) al usuario.
  - Base de datos local persistente en `data/tickets.json` para no perder tickets tras reinicios.

---

## ⚙️ Configuración y Credenciales

Las credenciales ya están configuradas en `.env`:
- **Token del Bot:** Configurado.
- **Client ID:** `1545609578215899176`
- **Servidor Principal:** `1369767579505397911` (𝕬𝖓𝖙𝖎𝖘𝖔𝖈𝖎𝖆𝖑†)
- **Servidor Test:** `1413967480078205031`

### Enlace de Invitación del Bot
Para invitar al bot al servidor de pruebas (o a cualquier servidor con permisos de administrador):
```
https://discord.com/oauth2/authorize?client_id=1545609578215899176&permissions=8&scope=bot%20applications.commands
```

---

## 📌 Comandos Disponibles

### 1. Despliegue del Panel
- `/panel-setup` (opcional: `canal: #canal-tickets`): Envía el panel Components V2 en el canal actual o especificado.
- `!panel-setup` (alternativa con prefijo para administradores).

### 2. Gestión dentro de Tickets
- `/ticket close [motivo]`: Cierra el ticket actual y guarda la transcripción.
- `/ticket add <usuario>`: Añade a un miembro o colaborador al canal del ticket.
- `/ticket remove <usuario>`: Remueve a un miembro del canal del ticket.
- `/ticket transcript`: Genera y descarga el archivo HTML con el historial del ticket.
- `/ping`: Verifica la latencia del bot.

---

## 🎨 ¿Cómo agregar tus emojis personalizados más adelante?

En el archivo `config.json` o en `src/components/panelBuilder.js`:
1. Cuando tengas los emojis en tu servidor, copia sus identificadores (por ejemplo `<:antisocial:123456789012345678>`).
2. Agrégalos antes de cada texto en `config.json` en las descripciones de las categorías.
3. Puedes ponerlos también en los botones con `.setEmoji('<:emoji_name:id>')`.

---

## ▶️ Cómo Iniciar el Bot

Simplemente ejecuta el archivo `start.bat` o desde la terminal:
```bash
node src/index.js
```
