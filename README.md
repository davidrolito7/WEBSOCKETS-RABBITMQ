# SIJUDI — Sistema de Notificaciones

Servicio independiente de notificaciones en tiempo real para los sistemas SIJUDI del Poder Judicial de Oaxaca.

---

## 1. Instalación Requerida

### 1.1 Erlang OTP (requerido por RabbitMQ)

Descargar e instalar:
```
otp_win64_26.2.5.20.exe
https://www.erlang.org/downloads
```
Instalar con opciones por defecto. No requiere configuración adicional.

### 1.2 RabbitMQ Server

Descargar e instalar:
```
rabbitmq-server-4.3.0.exe
https://www.rabbitmq.com/install-windows.html
```

Activar el panel de administración (ejecutar en CMD como Administrador):
```cmd
"C:\Program Files\RabbitMQ Server\rabbitmq_server-4.3.0\sbin\rabbitmq-plugins.bat" enable rabbitmq_management
net stop RabbitMQ
net start RabbitMQ
```

Panel web disponible en: `http://localhost:15672`  
Usuario: `guest` | Contraseña: `guest`

### 1.3 Node.js

Descargar e instalar v22 o superior:
```
https://nodejs.org
```

### 1.4 SQL Server Express (ya instalado)

Asegurarse de que:
- TCP/IP esté habilitado en puerto **1433**
- Autenticación mixta (SQL Server + Windows) activada
- Login `sa` habilitado con contraseña conocida

---

## 2. Código — Bajar del repositorio

```bash
git clone https://github.com/TU_USUARIO/rabbitMQ.git
cd rabbitMQ
npm install
```

---

## 3. Descripción de Archivos

```
rabbitMQ/
├── db.js                    # Conexión a SQL Server
├── setupDb.js               # Script de creación de BD y tablas (ejecutar 1 vez)
├── notificacionesService.js # Lógica de negocio y publicación RabbitMQ
├── notificacionesRouter.js  # Endpoints REST
├── server.js                # Servidor Express + Socket.io + Consumer RabbitMQ
├── index.html               # Bandeja visual de prueba
└── schema.sql               # Script SQL de referencia
```

---

### `db.js` — Conexión SQL Server

| Variable | Descripción |
|---|---|
| `config.server` | Nombre del servidor (`localhost` o IP) |
| `config.port` | Puerto TCP (1433) |
| `config.user` | Usuario SQL Server (`sa`) |
| `config.password` | Contraseña de `sa` |
| `config.database` | Base de datos (`NotificacionesSIJUDI`) |

| Función | Descripción |
|---|---|
| `getPool()` | Retorna el pool de conexiones activo (singleton) |

---

### `setupDb.js` — Inicialización de la BD

Crea la base de datos, tablas, índices y datos de prueba.  
**Se ejecuta una sola vez.**

#### Tablas creadas

| Tabla | Descripción |
|---|---|
| `Juzgados` | Catálogo de juzgados |
| `Usuarios` | Usuarios del sistema con su perfil y juzgado |
| `Notificaciones` | Cabecera de cada evento (1 por trámite asignado) |
| `NotificacionUsuario` | Detalle por usuario — quién debe recibirla y si ya la leyó |

#### Campos clave — `Notificaciones`

| Campo | Tipo | Descripción |
|---|---|---|
| `tramite_id` | INT | ID del trámite en el sistema origen |
| `tipo_tramite` | VARCHAR | Exhorto, Amparo, Sistema de Procedimientos, Oficio |
| `accion` | VARCHAR | Siempre `ASIGNADO` |
| `juzgado_origen_id` | INT | Juzgado que genera la notificación |
| `juzgado_destino_id` | INT | Juzgado que debe recibirla |
| `perfil_origen` | VARCHAR | Perfil de quien asigna (Juez, Secretario, etc.) |
| `perfil_destino` | VARCHAR | Perfil que debe recibir la notificación |
| `mensaje` | NVARCHAR | Mensaje generado automáticamente |
| `activa` | BIT | Soft-delete (1=activa, 0=eliminada) |

#### Campos clave — `NotificacionUsuario`

| Campo | Tipo | Descripción |
|---|---|---|
| `notificacion_id` | INT | FK a Notificaciones |
| `usuario_id` | INT | Usuario destinatario |
| `leida` | BIT | 0=pendiente, 1=vista |
| `fecha_lectura` | DATETIME | Cuándo la leyó |

---

### `notificacionesService.js` — Lógica de negocio

| Constante | Valor | Descripción |
|---|---|---|
| `EXCHANGE` | `sijudi.notificaciones` | Nombre del exchange RabbitMQ (tipo topic) |
| `MAX_PENDIENTES` | `5` | Límite: si el usuario supera este número solo se muestra el conteo |

| Función | Parámetros | Descripción |
|---|---|---|
| `crearNotificacion(body)` | Objeto con datos del trámite | Inserta en BD, crea una fila por destinatario del perfil, publica en RabbitMQ |
| `leerNotificaciones(usuario_id)` | ID del usuario | Si pendientes > 5 retorna solo conteo; si no, retorna la lista completa |
| `marcarLeida(notificacion_id, usuario_id)` | IDs | Marca la notificación como leída para ese usuario |
| `getRabbitChannel()` | — | Retorna el canal RabbitMQ reutilizable (singleton) |

**Routing key RabbitMQ:** `juzgado.{id}.{perfil}`  
Ejemplo: `juzgado.2.Secretario`

---

### `notificacionesRouter.js` — Endpoints REST

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/notificaciones` | Crea notificación y notifica a destinatarios |
| `GET` | `/api/notificaciones` | Bandeja del usuario autenticado |
| `PUT` | `/api/notificaciones/:id` | Marca como leída |

---

### `server.js` — Servidor principal

| Constante | Valor | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor HTTP |
| `EXCHANGE` | Importado del servicio | Exchange RabbitMQ a consumir |

| Función | Descripción |
|---|---|
| `startConsumer()` | Conecta a RabbitMQ, escucha la cola `sijudi.notif.consumer` y reenvía eventos a los usuarios conectados vía Socket.io |

**Socket.io — eventos:**

| Evento (cliente → servidor) | Descripción |
|---|---|
| `join` | El cliente se une a su sala personal (`usuario_{id}`) |
| `leave` | El cliente abandona su sala anterior |

| Evento (servidor → cliente) | Descripción |
|---|---|
| `notificacion` | Se emite cuando llega un mensaje del Exchange para ese usuario |

---

## 4. Comandos para levantar el sistema

Ejecutar en orden:

```powershell
# 1. Verificar que RabbitMQ está corriendo
Get-Service | Where-Object { $_.Name -like '*Rabbit*' }
# Si está detenido:
net start RabbitMQ

# 2. Verificar que SQL Server Express está corriendo
sc.exe query type= all state= all | Select-String "MSSQL"
# Si está detenido:
net start 'MSSQL$SQLEXPRESS'

# 3. Crear BD y tablas (solo la primera vez)
cd D:\PJO\rabbitMQ
node setupDb.js

# 4. Levantar el servidor
npm start
```

Salida esperada:
```
[SIJUDI] Servidor corriendo en http://localhost:3000
[RabbitMQ] Consumer listo → sijudi.notificaciones
```

Abrir la bandeja visual en el navegador:
```
http://localhost:3000
```

---

## 5. Ejemplo de uso desde C# — Crear notificación al guardar un trámite

Al guardar una asignación de trámite en cualquier sistema SIJUDI, consumir el endpoint `POST /api/notificaciones`.

### 5.1 Modelo

```csharp
public class NotificacionRequest
{
    public int    TramiteId        { get; set; }
    public string TipoTramite      { get; set; }  // "Exhorto" | "Amparo" | "Sistema de Procedimientos" | "Oficio"
    public string Accion           { get; set; }  // Siempre "ASIGNADO"
    public int    JuzgadoOrigenId  { get; set; }
    public string PerfilOrigen     { get; set; }  // "Juez" | "Secretario" | "Notificador" | "Oficial"
    public int    JuzgadoDestinoId { get; set; }
    public string PerfilDestino    { get; set; }
    public string Mensaje          { get; set; }
}
```

### 5.2 Servicio de notificaciones

```csharp
public class SijudiNotificacionService
{
    private readonly HttpClient _http;
    private const string BaseUrl = "http://localhost:3000/api/notificaciones";

    public SijudiNotificacionService(HttpClient http)
    {
        _http = http;
    }

    public async Task EnviarAsync(NotificacionRequest notif)
    {
        var json    = JsonSerializer.Serialize(notif, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _http.PostAsync(BaseUrl, content);
        response.EnsureSuccessStatusCode();
    }
}
```

### 5.3 Uso al guardar una asignación de trámite

```csharp
[ApiController]
[Route("api/[controller]")]
public class TramitesController : ControllerBase
{
    private readonly SijudiNotificacionService _notifService;
    private readonly ITramiteRepository        _tramiteRepo;

    public TramitesController(SijudiNotificacionService notifService,
                               ITramiteRepository tramiteRepo)
    {
        _notifService = notifService;
        _tramiteRepo  = tramiteRepo;
    }

    [HttpPost("asignar")]
    public async Task<IActionResult> AsignarTramite([FromBody] AsignacionDto dto)
    {
        // 1. Guardar el trámite en la BD del sistema
        var tramite = await _tramiteRepo.GuardarAsync(dto);

        // 2. Generar mensaje automático
        var mensaje = $"{dto.TipoTramite} #{tramite.Id} asignado desde {dto.JuzgadoOrigenNombre} " +
                      $"por {dto.PerfilOrigen}, requiere atención del {dto.PerfilDestino} " +
                      $"en {dto.JuzgadoDestinoNombre}.";

        // 3. Enviar notificación al servicio SIJUDI
        await _notifService.EnviarAsync(new NotificacionRequest
        {
            TramiteId        = tramite.Id,
            TipoTramite      = dto.TipoTramite,       // "Exhorto"
            Accion           = "ASIGNADO",
            JuzgadoOrigenId  = dto.JuzgadoOrigenId,
            PerfilOrigen     = dto.PerfilOrigen,       // "Juez"
            JuzgadoDestinoId = dto.JuzgadoDestinoId,
            PerfilDestino    = dto.PerfilDestino,      // "Secretario"
            Mensaje          = mensaje
        });

        return Ok(tramite);
    }
}
```

### 5.4 Registro en `Program.cs`

```csharp
builder.Services.AddHttpClient<SijudiNotificacionService>();
```

---

## 6. Ejemplo en Angular — Componente de Bandeja

### 6.1 Instalar Socket.io client

```bash
npm install socket.io-client
```

### 6.2 Modelo

```typescript
// models/notificacion.model.ts
export interface Notificacion {
  id:               number;
  tramite_id:       number;
  tipo_tramite:     string;
  accion:           string;
  juzgado_origen_id: number;
  perfil_origen:    string;
  mensaje:          string;
  fecha_creacion:   string;
  leida:            boolean;
}

export interface BandejaResponse {
  soloConteo:     boolean;
  pendientes:     number;
  notificaciones?: Notificacion[];
}
```

### 6.3 Servicio

```typescript
// services/notificaciones.service.ts
import { Injectable }    from '@angular/core';
import { HttpClient }    from '@angular/common/http';
import { Observable }    from 'rxjs';
import { io, Socket }    from 'socket.io-client';
import { BandejaResponse } from '../models/notificacion.model';

@Injectable({ providedIn: 'root' })
export class NotificacionesService {

  private readonly API    = 'http://localhost:3000/api/notificaciones';
  private readonly socket: Socket;

  constructor(private http: HttpClient) {
    this.socket = io('http://localhost:3000');
  }

  // Unirse a la sala del usuario (llamar al iniciar sesión)
  joinSala(usuarioId: number): void {
    this.socket.emit('join', usuarioId);
  }

  // Observable de notificaciones en tiempo real
  onNotificacion(): Observable<any> {
    return new Observable(observer => {
      this.socket.off('notificacion');
      this.socket.on('notificacion', (data: any) => observer.next(data));
    });
  }

  // Obtener bandeja del usuario autenticado
  getBandeja(): Observable<BandejaResponse> {
    return this.http.get<BandejaResponse>(this.API);
  }

  // Marcar como leída
  marcarLeida(notifId: number): Observable<any> {
    return this.http.put(`${this.API}/${notifId}`, {});
  }
}
```

### 6.4 Componente

```typescript
// bandeja/bandeja.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription }                  from 'rxjs';
import { NotificacionesService }         from '../services/notificaciones.service';
import { Notificacion, BandejaResponse } from '../models/notificacion.model';

@Component({
  selector:    'app-bandeja',
  templateUrl: './bandeja.component.html',
})
export class BandejaComponent implements OnInit, OnDestroy {

  usuarioId     = 7;           // Viene del servicio de autenticación
  pendientes    = 0;
  soloConteo    = false;
  notificaciones: Notificacion[] = [];
  toasts:         any[]          = [];

  private sub!: Subscription;
  private readonly TOAST_DUR = 8000;

  constructor(private notifSvc: NotificacionesService) {}

  ngOnInit(): void {
    // Unirse a la sala del usuario
    this.notifSvc.joinSala(this.usuarioId);

    // Cargar bandeja inicial con toasts
    this.cargarBandeja(true);

    // Escuchar notificaciones en tiempo real
    this.sub = this.notifSvc.onNotificacion().subscribe(data => {
      if (Array.isArray(data.usuarios) && data.usuarios.includes(this.usuarioId)) {
        this.mostrarToast(data);
      }
      this.cargarBandeja(false);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  cargarBandeja(conToasts: boolean): void {
    this.notifSvc.getBandeja().subscribe(resp => {
      this.pendientes = resp.pendientes;
      this.soloConteo = resp.soloConteo;

      if (!resp.soloConteo && resp.notificaciones) {
        this.notificaciones = resp.notificaciones;

        if (conToasts) {
          const pendientes = resp.notificaciones.filter(n => !n.leida);
          pendientes.forEach((n, i) =>
            setTimeout(() => this.mostrarToast({ ...n, esPendiente: true }), i * 600)
          );
          // Marcar leídas después de mostrar todos los toasts
          if (pendientes.length) {
            setTimeout(() => this.marcarTodasLeidas(pendientes.map(n => n.id)),
              pendientes.length * 600 + 2000);
          }
        }
      }
    });
  }

  marcarTodasLeidas(ids: number[]): void {
    ids.forEach(id => this.notifSvc.marcarLeida(id).subscribe());
    this.notificaciones.forEach(n => { if (ids.includes(n.id)) n.leida = true; });
    this.pendientes = 0;
  }

  mostrarToast(data: any): void {
    const toast = { ...data, id: Date.now() };
    this.toasts.push(toast);
    setTimeout(() => this.cerrarToast(toast.id), this.TOAST_DUR);
  }

  cerrarToast(id: number): void {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }
}
```

### 6.5 Template

```html
<!-- bandeja/bandeja.component.html -->

<!-- Toasts -->
<div class="toast-container">
  <div *ngFor="let t of toasts" class="toast">
    <div class="toast-icon">⚖️</div>
    <div class="toast-body">
      <div class="toast-app">SIJUDI · {{ t.tipo_tramite }}</div>
      <div class="toast-title">{{ t.accion }} — Trámite #{{ t.tramite_id }}</div>
      <div class="toast-msg">{{ t.mensaje }}</div>
    </div>
    <button (click)="cerrarToast(t.id)">✕</button>
  </div>
</div>

<!-- Badge de pendientes -->
<span class="badge" *ngIf="pendientes > 0">{{ pendientes }}</span>

<!-- Solo conteo cuando > 5 -->
<div *ngIf="soloConteo" class="solo-conteo">
  <div class="num">{{ pendientes }}</div>
  <p>notificaciones pendientes</p>
</div>

<!-- Lista de notificaciones -->
<ul *ngIf="!soloConteo">
  <li *ngFor="let n of notificaciones" [class.no-leida]="!n.leida">
    <strong>{{ n.tipo_tramite }} #{{ n.tramite_id }}</strong><br>
    <span>{{ n.mensaje }}</span><br>
    <small>{{ n.perfil_origen }} · {{ n.fecha_creacion | date:'short':'':'es-MX' }}</small>
  </li>
  <li *ngIf="notificaciones.length === 0">Sin notificaciones</li>
</ul>
```

### 6.6 Módulo — importar `HttpClientModule`

```typescript
// app.module.ts
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  imports: [
    HttpClientModule,
    // ...
  ]
})
export class AppModule {}
```

---

## 7. Flujo Completo de Uso

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIJUDI — Flujo de Notificación               │
└─────────────────────────────────────────────────────────────────┘

  Sistema SIJUDI (C# / Angular)
       │
       │  1. Usuario asigna un trámite (Exhorto, Amparo, etc.)
       │
       ▼
  POST /api/notificaciones
  { tramite_id, tipo_tramite, accion:"ASIGNADO",
    juzgado_origen_id, perfil_origen,
    juzgado_destino_id, perfil_destino, mensaje }
       │
       ▼
  notificacionesService.crearNotificacion()
       │
       ├─► SQL Server: INSERT Notificaciones  (cabecera)
       │
       ├─► SQL Server: SELECT Usuarios WHERE perfil=destino AND juzgado=destino
       │         └── Si hay 3 Secretarios → 3 filas en NotificacionUsuario
       │
       └─► RabbitMQ PUBLISH
           Exchange: sijudi.notificaciones
           Routing key: juzgado.{id}.{perfil}
                │
                ▼
           Consumer (server.js)
                │
                ├─► Socket.io EMIT → sala usuario_7  (Elena Ruiz)
                └─► Socket.io EMIT → sala usuario_10 (Jorge Castillo)

  ─────────────────────────────────────────────────────────────────

  Caso A — Usuario ESTÁ conectado (sesión abierta):
       │
       ▼
  socket.on('notificacion') → mostrarToast() → badge sube
  El toast aparece 8 segundos y desaparece automáticamente.
  La notificación queda PENDIENTE hasta que el usuario abra la bandeja.

  ─────────────────────────────────────────────────────────────────

  Caso B — Usuario NO está conectado:
       │
       ▼
  Notificación queda en SQL Server (leida=0)
  Al conectarse → GET /api/notificaciones/:id
       │
       ├─► pendientes ≤ 5 → muestra lista + lanza 1 toast por pendiente
       │                     (escalonados cada 600ms)
       │                     → 2s después: auto-marca como leídas
       │
       └─► pendientes  > 5 → muestra solo el número
                             No lanza toasts (evita saturar la pantalla)

  ─────────────────────────────────────────────────────────────────

  Regla de múltiples usuarios por perfil:
       Si Juzgado 2 tiene 2 Secretarios (usuarios 7 y 10),
       AMBOS reciben la notificación (1 fila cada uno en NotificacionUsuario).
       Cada uno la ve y la marca como leída de forma independiente.
```

---

## Referencia rápida de endpoints

```
POST   http://localhost:3000/api/notificaciones
GET    http://localhost:3000/api/notificaciones
PUT    http://localhost:3000/api/notificaciones/:id
```

Panel RabbitMQ: `http://localhost:15672` (guest/guest)  
Bandeja visual:  `http://localhost:3000`
