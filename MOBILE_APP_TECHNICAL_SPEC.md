# Техническое задание на разработку мобильного приложения FlowTask

---

## 1. Общие сведения

**Название проекта:** FlowTask Mobile  
**Сервер:** `https://flowtask220.ru`  
**База API:** `https://flowtask220.ru/api/`  
**Документация API (ReDoc):** `https://flowtask220.ru/api/redoc/`  
**Swagger UI:** `https://flowtask220.ru/api/docs/`  
**OpenAPI Schema (JSON):** `https://flowtask220.ru/api/schema/`  

> **Рекомендация:** Сгенерируйте клиентский код из OpenAPI-схемы. Файл JSON схемы доступен по адресу `https://flowtask220.ru/api/schema/`.

---

## 2. Стек и протоколы

| Параметр | Значение |
|---|---|
| **Протокол API** | REST over HTTPS |
| **Формат данных** | JSON |
| **Авторизация** | JWT (Bearer token), lifetime: access = 24h, refresh = 7d |
| **WebSocket** | WSS для чата и уведомлений в реальном времени |
| **Часовой пояс** | `Europe/Moscow` (UTC+3) |
| **Пагинация** | Cursor-based, 20 записей на страницу (max 100) |
| **Язык** | Русский (ответы сервера на русском) |

---

## 3. Аутентификация и авторизация

### 3.1. Общая схема

Сервер использует **OTP-аутентификацию** (одноразовый пароль по email). Паролей нет — пользователь получает 6-значный код на email.

**Flow входа:**
1. Клиент отправляет email → сервер генерирует и отправляет OTP
2. Клиент отправляет OTP → сервер возвращает JWT-токен
3. Все последующие запросы — с заголовком `Authorization: Bearer <access_token>`

### 3.2. Endpoints авторизации

#### Отправка OTP кода

```
POST https://flowtask220.ru/api/auth/login/
```

**Request:**
```json
{
  "email": "ivanov@zdrav.mos.ru",
  "use_reserve_email": false
}
```

| Поле | Тип | Обязательное | Описание |
|---|---|---|---|
| `email` | string (email) | ✅ | Должен заканчиваться на `@zdrav.mos.ru` |
| `use_reserve_email` | boolean | ❌ | Если `true` — OTP также отправляется на резервный email пользователя |

**Response 200:**
```json
{
  "message": "OTP code sent to your email"
}
```

**Response 400:**
```json
{
  "error": "User with this email does not exist"
}
```

**Throttling:** 3 запроса в минуту на один email.

---

#### Проверка OTP кода (получение JWT)

```
POST https://flowtask220.ru/api/auth/verify/
```

**Request:**
```json
{
  "email": "ivanov@zdrav.mos.ru",
  "otp": "123456"
}
```

| Поле | Тип | Обязательное | Описание |
|---|---|---|---|
| `email` | string (email) | ✅ | Основной или резервный email |
| `otp` | string (6 цифр) | ✅ | 6-значный код |

**Response 200:**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": 42,
    "uid": "user_42",
    "email": "ivanov@zdrav.mos.ru",
    "full_name": "Иванов Иван Иванович",
    "username": "ivanov_ii",
    "phone": "+7 (999) 123-45-67",
    "position": "Врач-терапевт",
    "position_id": 5,
    "department": "Поликлиника №1",
    "department_id": 3,
    "branch": "Филиал «Центральный»",
    "branch_id": 1,
    "office_number": "305",
    "birth_date": "1990-01-15",
    "role": "user",
    "is_service": false,
    "user_id": "user_42",
    "avatar": "https://...",
    "reserve_email": "personal@gmail.com",
    "profile_updated_at": "2026-04-01T12:00:00+03:00"
  }
}
```

**Response 400:**
```json
{
  "otp": "Invalid or expired OTP code"
}
```

**Throttling:** 5 попыток за 15 минут. После 10 неудачных попыток — блокировка email на 30 минут.

---

#### Выход (Logout)

```
POST https://flowtask220.ru/api/auth/logout/
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "message": "Successfully logged out"
}
```

> **Примечание:** На сервере blacklist токенов пока не реализован. Клиент должен локально удалить сохранённый токен.

---

#### Текущий пользователь (Me)

```
GET https://flowtask220.ru/api/auth/me/
Authorization: Bearer <token>
```

**Response 200:** Тот же объект `user`, что и при VerifyOTP.

---

### 3.3. Роли пользователей

| Роль | Описание | Права |
|---|---|---|
| `user` | Обычный пользователь | Свои задачи, профиль, чаты |
| `hr` | Кадровик / руководитель | Управление пользователями, все задачи |
| `admin` | Администратор | Полный доступ ко всему |

---

### 3.4. Refresh токена

```
POST https://flowtask220.ru/api/token/refresh/
```

**Request:**
```json
{
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

**Response 200:**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

> **Важно:** `REFRESH_TOKEN_LIFETIME = 7 дней`. `ROTATE_REFRESH_TOKENS = true` — при каждом refresh старый refresh-токен аннулируется, выдаётся новый.

---

### 3.5. Авторизация в запросах

Все запросы (кроме `/auth/login/` и `/auth/verify/`) требуют заголовок:

```
Authorization: Bearer <access_token>
```

При отсутствии или истечении токена сервер вернёт `401 Unauthorized`.

---

## 4. WebSocket подключение

### 4.1. Чат (реальное время)

```
wss://flowtask220.ru/ws/chat/{chat_id}/?token=<jwt_access_token>
```

**Формат событий от сервера:**

| `type` | Описание |
|---|---|
| `connection_established` | Подтверждение подключения |
| `new_message` | Новое сообщение в чате |
| `message_read` | Сообщение прочитано (статус прочтения) |
| `chat_updated` | Обновление данных чата (last_message, unread_count) |
| `typing` | Индикатор набора текста |
| `ping` | Heartbeat от сервера (интервал 30 сек) |
| `error` | Ошибка |

**Формат событий от клиента:**

| `type` | Описание |
|---|---|
| `message` | Отправить текстовое сообщение |
| `mark_read` | Отметить сообщения прочитанными |
| `typing` | Индикатор набора текста |
| `pong` | Ответ на ping от сервера |

**Пример — отправка сообщения:**
```json
{
  "type": "message",
  "content": "Привет! Как дела?",
  "mentioned_users": ["user_42"],
  "attachments": ["file-uuid-1", "file-uuid-2"]
}
```

**Пример — отметка прочитанных:**
```json
{
  "type": "mark_read",
  "message_ids": ["msg-uuid-1", "msg-uuid-2"]
}
```

**Пример — typing:**
```json
{
  "type": "typing",
  "is_typing": true
}
```

**Коды закрытия соединения:**

| Код | Описание |
|---|---|
| 4001 | Не авторизован |
| 4003 | Не участник чата |
| 4008 | Ping timeout (3 пропущенных пинга) |

---

### 4.2. Уведомления (реальное время)

```
wss://flowtask220.ru/ws/notifications/?token=<jwt_access_token>
```

**Формат событий от сервера:**

| `type` | Описание |
|---|---|
| `notification` | Новое уведомление |

**Пример уведомления:**
```json
{
  "type": "notification",
  "data": {
    "id": 123,
    "type": "task_assigned",
    "title": "Новая задача",
    "message": "Вам назначена задача «Подготовить отчёт»",
    "related_task_id": "task_55",
    "link": "/tasks/55/",
    "is_read": false,
    "created_at": "2026-04-08T10:00:00+03:00"
  }
}
```

---

## 5. Полное описание API

### 5.1. Формат ответов

Все ответы сервера оборачиваются в ключ `data` (кастомный `FlowTaskJSONRenderer`):

```json
{
  "data": { ... }
}
```

Для списков с пагинацией:

```json
{
  "data": {
    "results": [ ... ],
    "count": 123,
    "next": "https://flowtask220.ru/api/tasks/?page=2",
    "previous": null,
    "page": 1,
    "pages": 7,
    "per_page": 20
  }
}
```

### 5.2. Коды ошибок

| Код | Значение |
|---|---|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request (ошибка валидации) |
| 401 | Unauthorized (нет токена / токен истёк) |
| 403 | Forbidden (нет прав) |
| 404 | Not Found |
| 429 | Too Many Requests (throttling) |
| 500 | Internal Server Error |

---

### 5.3. Пользователи

#### Список пользователей

```
GET /api/users/?page=1&limit=20&search=Иванов&role=user&department_id=3
Authorization: Bearer <token>
```

**Query параметры:**
| Параметр | Тип | Описание |
|---|---|---|
| `page` | int | Номер страницы |
| `limit` | int | Кол-во записей (max 100) |
| `search` | string | Поиск по ФИО, email, username |
| `role` | string | Фильтр по роли: `user`, `hr`, `admin` |
| `department_id` | int | Фильтр по отделу |
| `branch_id` | int | Фильтр по филиалу |

#### Профиль пользователя

```
GET /api/users/{id}/
Authorization: Bearer <token>
```

`id` — числовой идентификатор или строковый `user_id`.

#### Создание пользователя (только HR/Admin)

```
POST /api/users/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "email": "petrov@zdrav.mos.ru",
  "username": "petrov_aa",
  "full_name": "Петров Алексей Андреевич",
  "position": "Врач-хирург",
  "department_id": 3,
  "branch": "Филиал «Центральный»",
  "phone": "+7 (999) 111-22-33",
  "office_number": "410",
  "birth_date": "1985-05-20",
  "role": "user"
}
```

**Валидация:**
| Поле | Правило |
|---|---|
| `email` | Обязательно, формат email, домен `@zdrav.mos.ru` |
| `username` | Обязательно, уникальное, max 150 символов |
| `full_name` | Max 255 символов |
| `position` | Строка — ищется в справочнике должностей (case-insensitive) |
| `department_id` | Число, должен существовать |
| `branch` | Строка — ищется в справочнике филиалов |
| `phone` | Max 20 символов |
| `office_number` | Max 20 символов |
| `birth_date` | Формат `YYYY-MM-DD`, не может быть в будущем |
| `role` | Только `user`, `hr`, `admin` |

#### Обновление пользователя

```
PATCH /api/users/{id}/
Authorization: Bearer <token>
```

> **HR/Admin** могут редактировать все поля, включая `role`, `position`, `department`, `branch`.  
> **Обычный пользователь** может редактировать только свой профиль и НЕ может менять `position`, `department`, `branch`, `role`.

#### Поиск пользователей

```
GET /api/users/search/?q=Иванов
Authorization: Bearer <token>
```

#### Статистика пользователя

```
GET /api/users/stats/
Authorization: Bearer <token>
```

Возвращает статистику по задачам пользователя.

---

### 5.4. Задачи

#### Список задач

```
GET /api/tasks/?page=1&status=todo&priority=high&assignee_id=42&creator_id=10
Authorization: Bearer <token>
```

**Query параметры:**
| Параметр | Тип | Описание |
|---|---|---|
| `status` | string | `todo`, `in_progress`, `transferred`, `completed`, `failed`, `paused` |
| `priority` | string | `low`, `medium`, `high`, `urgent` |
| `assignee_id` | int/string | Фильтр по исполнителю |
| `creator_id` | int/string | Фильтр по создателю |
| `department_id` | int | Фильтр по отделу |
| `branch_id` | int | Фильтр по филиалу |
| `search` | string | Поиск по заголовку/описанию |
| `ordering` | string | Сортировка: `-created_at`, `deadline`, `priority`, `status` |

#### Создание задачи

```
POST /api/tasks/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "title": "Подготовить отчёт за Q1",
  "description": "Необходимо подготовить отчёт...",
  "status": "todo",
  "priority": "high",
  "assignees": ["user_42", "user_43"],
  "assigned_departments": [3, 5],
  "deadline": "2026-04-15T18:00:00+03:00",
  "office_number": "305",
  "branch": 1,
  "parent_task_id": "task_10"
}
```

**Валидация:**
| Поле | Правило |
|---|---|
| `title` | Обязательно, max 500 символов |
| `status` | Обязательно, при создании только `todo` |
| `priority` | По умолчанию `medium` |
| `assignees` | Массив идентификаторов (числовых или `user_xxx`) |
| `assigned_departments` | Массив числовых ID отделов |
| `deadline` | Nullable, формат ISO 8601 |
| `parent_task_id` | Формат `task_{id}`, должен существовать |
| `branch` | ID или название филиала из справочника |

> **Автологика:** Если указан >1 исполнитель, `task_type` автоматически ставится в `multiple`. `assigned_departments` автозаполняется из отделов исполнителей.

#### Получение задачи

```
GET /api/tasks/{id}/
Authorization: Bearer <token>
```

`id` — формат `task_{number}` или числовой ID.

#### Обновление задачи

```
PATCH /api/tasks/{id}/
Authorization: Bearer <token>
```

> **Валидация:** Нельзя завершить задачу (`completed`), если есть незавершённые подзадачи. Нельзя указать `parent_task_id` равный собственному ID.

#### Мои задачи

```
GET /api/tasks/my/?status=todo
Authorization: Bearer <token>
```

#### Удаление задачи

```
DELETE /api/tasks/{id}/
Authorization: Bearer <token>
```

---

### 5.5. Комментарии к задачам

#### Список комментариев

```
GET /api/tasks/{task_id}/comments/?page=1
Authorization: Bearer <token>
```

#### Создание комментария

```
POST /api/tasks/{task_id}/comments/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "content": "Документы готовы, отправляю",
  "mentioned_users": ["user_42"],
  "attachments": ["file-uuid-1"]
}
```

**Валидация:**
| Поле | Правило |
|---|---|
| `content` | Обязательно (если нет `attachments`), max 10 000 символов, не пустая строка |
| `mentioned_users` | Массив строковых `user_id`, должны существовать |
| `attachments` | Массив UUID загруженных файлов |

> **Валидация:** Комментарий может быть пустым, если есть вложения (attachments).

#### Обновление комментария

```
PATCH /api/tasks/{task_id}/comments/{comment_id}/
Authorization: Bearer <token>
```

> `mentioned_users` — read-only при обновлении.

#### Удаление комментария

```
DELETE /api/tasks/{task_id}/comments/{comment_id}/
Authorization: Bearer <token>
```

---

### 5.6. Чаты

#### Список чатов

```
GET /api/chats/?page=1&type=private
Authorization: Bearer <token>
```

**Query параметры:**
| Параметр | Тип | Описание |
|---|---|---|
| `type` | string | `private`, `group`, `task` |
| `search` | string | Поиск по названию |

#### Создание чата

```
POST /api/chats/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "type": "group",
  "name": "Обсуждение проекта",
  "participant_ids": ["user_42", "user_43"]
}
```

**Валидация:**
| Поле | Правило |
|---|---|
| `type` | `private`, `group`, `task` |
| `name` | Обязательно для `group` |
| `participant_ids` | Обязательно, непустой массив. Для `private` — ровно 1 участник |

#### Получение чата

```
GET /api/chats/{chat_id}/
Authorization: Bearer <token>
```

#### Обновление чата

```
PATCH /api/chats/{chat_id}/
Authorization: Bearer <token>
```

#### Удаление чата

```
DELETE /api/chats/{chat_id}/
Authorization: Bearer <token>
```

#### Сообщения чата

```
GET /api/chats/{chat_id}/messages/?page=1
Authorization: Bearer <token>
```

#### Отправка сообщения (REST, для оффлайн-очереди)

```
POST /api/chats/{chat_id}/messages/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "content": "Привет всем!",
  "mentioned_users": ["user_42"]
}
```

**Валидация:**
| Поле | Правило |
|---|---|
| `content` | Обязательно, непустое после trim, max 10 000 символов |
| `sender_id` | Должен быть участником чата |
| `mentioned_users` | Массив `user_id` |

> **Рекомендация:** Для онлайн-режима используйте WebSocket. REST — для отложенной отправки (оффлайн-очередь).

#### Отметить сообщения прочитанными

```
POST /api/chats/{chat_id}/messages/mark-read/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "message_ids": ["msg-uuid-1", "msg-uuid-2"]
}
```

#### Поиск чатов

```
GET /api/chats/search/?q=проект
Authorization: Bearer <token>
```

#### Чат по задаче

```
GET /api/chats/by-task/{task_id}/
Authorization: Bearer <token>
```

#### Создание чата для задачи

```
POST /api/chats/task/
Authorization: Bearer <token>
```

#### Добавить участников

```
POST /api/chats/{chat_id}/participants/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "participant_ids": ["user_50", "user_51"]
}
```

#### Удалить участника

```
DELETE /api/chats/{chat_id}/participants/{user_id}/
Authorization: Bearer <token>
```

---

### 5.7. Файлы

#### Загрузка файла

```
POST /api/files/upload/
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Request:** FormData с полем `file`.

**Валидация:**
| Правило | Значение |
|---|---|
| Max размер файла | 10 МБ (настраивается через `MAX_FILE_SIZE`) |
| MIME-тип | Автоопределение через `python-magic` |
| Файл | Не может быть пустым |

**Response 201:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "original_name": "report.pdf",
  "mime_type": "application/pdf",
  "size": 1048576,
  "uploaded_at": "2026-04-08T12:00:00+03:00",
  "url": "https://flowtask220.ru/media/files/report.pdf"
}
```

#### Список файлов

```
GET /api/files/?page=1
Authorization: Bearer <token>
```

#### Получение файла

```
GET /api/files/{file_id}/
Authorization: Bearer <token>
```

#### Удаление файла

```
DELETE /api/files/{file_id}/
Authorization: Bearer <token>
```

#### Неиспользуемые файлы

```
GET /api/files/unused/
Authorization: Bearer <token>
```

---

### 5.8. Отделы

#### Список отделов

```
GET /api/departments/?page=1&search=Поликлиника
Authorization: Bearer <token>
```

#### Создание отдела (Admin/HR)

```
POST /api/departments/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "Отдел кадров",
  "description": "Управление персоналом",
  "parent_id": 1,
  "head_id": 42
}
```

**Валидация:**
| Поле | Правило |
|---|---|
| `name` | Обязательно, уникальное, max 200 символов |
| `parent_id` | Должен существовать, не может ссылаться на себя |
| `head_id` | Должен существовать |

#### Обновление отдела

```
PATCH /api/departments/{id}/
Authorization: Bearer <token>
```

#### Удаление отдела

```
DELETE /api/departments/{id}/
Authorization: Bearer <token>
```

---

### 5.9. Справочники (должности и филиалы)

#### Список должностей

```
GET /api/references/position/?page=1&search=Врач
Authorization: Bearer <token>
```

#### Создание должности (Admin/HR)

```
POST /api/references/position/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "value": "Врач-кардиолог"
}
```

**Валидация:**
| Поле | Правило |
|---|---|
| `value` / `position` | Обязательно, max 200 символов, уникальность (case-insensitive) |

#### Список филиалов

```
GET /api/references/branch/?page=1
Authorization: Bearer <token>
```

#### Создание филиала (Admin/HR)

```
POST /api/references/branch/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "value": "Филиал «Северный»"
}
```

> CRUD для обоих справочников аналогичен.

---

### 5.10. Уведомления

#### Список уведомлений

```
GET /api/notifications/?page=1&is_read=false
Authorization: Bearer <token>
```

> Пользователь видит только свои уведомления. Admin видит все.

#### Отметить прочитанным

```
PATCH /api/notifications/{id}/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "is_read": true
}
```

#### Создание уведомления (только Admin)

```
POST /api/notifications/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "type": "task_assigned",
  "title": "Новая задача",
  "message": "Вам назначена задача",
  "user_id": "user_42",
  "related_task_id": "task_55",
  "link": "/tasks/55/"
}
```

#### Удаление уведомления

```
DELETE /api/notifications/{id}/
Authorization: Bearer <token>
```

---

### 5.11. Новости

#### Список новостей

```
GET /api/news/?page=1&category_id=1
Authorization: Bearer <token>
```

> Новость возвращается только если пользователь имеет право её видеть (проверка по аудитории: все, отделы, конкретные пользователи).

#### Создание новости

```
POST /api/news/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "title": "Обновление графика",
  "content": "С понедельника новый график...",
  "category_id": 2,
  "send_to_all": false,
  "departments": [3, 5],
  "users": [42, 43],
  "expires_at": "2026-05-01T00:00:00+03:00",
  "is_pinned": true
}
```

**Валидация:**
| Поле | Правило |
|---|---|
| `title` | Обязательно, max 255 символов |
| `content` | Обязательно |
| `category_id` | Должна существовать |
| `send_to_all` | Если `false`, требуется хотя бы один `departments` или `users` |
| `expires_at` | Должен быть в будущем, формат ISO 8601 |
| `departments` | Массив числовых ID |
| `users` | Массив числовых ID |

#### Обновление / удаление новости

```
PATCH /api/news/{id}/
DELETE /api/news/{id}/
Authorization: Bearer <token>
```

> Только автор новости или Admin.

---

#### Категории новостей

```
GET    /api/news-categories/
POST   /api/news-categories/       # Admin
GET    /api/news-categories/{id}/
PATCH  /api/news-categories/{id}/  # Admin
DELETE /api/news-categories/{id}/  # Admin
```

**Request (создание):**
```json
{
  "name": "Объявления",
  "description": "Важные объявления для сотрудников"
}
```

**Валидация:** `name` — уникальное, max 100 символов.

---

### 5.12. Шаблоны задач

#### Список шаблонов

```
GET /api/task-templates/?page=1&category=it
Authorization: Bearer <token>
```

#### Создание шаблона

```
POST /api/task-templates/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "Заявка на доступ",
  "category": "it",
  "description": "Шаблон для заявки на доступ",
  "title_template": "Заявка на доступ — {full_name}",
  "description_template": "Прошу предоставить доступ...",
  "priority": "medium",
  "task_type": "single",
  "estimated_days": 3,
  "icon": "Key",
  "is_system": false
}
```

**Валидация:**
| Поле | Правило |
|---|---|
| `name` | Обязательно, max 200 символов |
| `title_template` | Обязательно, max 500 символов |
| `priority` | `low`, `medium`, `high`, `urgent`. Default: `medium` |
| `task_type` | `single`, `multiple`. Default: `single` |
| `category` | Выбор из фиксированного набора, default: `other` |
| `icon` | Max 50 символов, default: `FileText` |
| `is_system` | Default `false`. Только Admin может установить `true` |
| `estimated_days` | Integer, default: 1 |

---

### 5.13. Оборудование

#### Список оборудования

```
GET /api/equipment/?page=1&branch_id=1&is_working=true
Authorization: Bearer <token>
```

**Query параметры:**
| Параметр | Тип | Описание |
|---|---|---|
| `branch_id` | int | Фильтр по филиалу |
| `is_working` | bool | Рабочее/неисправное |
| `equipment_type` | string | `printer`, `mfu`, `monitor`, `system_unit`, `monoblock`, `arm_emias`, `other` |
| `search` | string | Поиск по модели, серийному номеру |

#### Создание оборудования

```
POST /api/equipment/
Authorization: Bearer <token>
```

**Request:**
```json
{
  "branch": 1,
  "equipment_type": "printer",
  "model_name": "HP LaserJet Pro",
  "manufacturer": "HP",
  "serial_number": "SN123456",
  "inventory_number": "INV-00123",
  "room": "305",
  "description": "Принтер в кабинете 305",
  "is_working": true,
  "comment": ""
}
```

> **Доступ:** Только пользователи с ролью `admin` или флагом `is_service` (IT-специалисты).

---

### 5.14. Health Check

```
GET /api/health/
```

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected"
}
```

> Не требует авторизации.

---

## 6. Модели данных

### 6.1. User
| Поле | Тип | Примечание |
|---|---|---|
| `id` | int (PK) | Внутренний ID |
| `uid` | string | `"user_{id}"` — публичный идентификатор |
| `email` | string | Уникальный, `@zdrav.mos.ru` |
| `reserve_email` | string | Nullable, резервный email для OTP |
| `full_name` | string | ФИО |
| `username` | string | Уникальный |
| `phone` | string | |
| `position` | string | Из справочника |
| `position_id` | int | FK → Reference |
| `department` | string | |
| `department_id` | int | FK → Department |
| `branch` | string | Из справочника |
| `branch_id` | int | FK → Reference |
| `office_number` | string | Номер кабинета |
| `birth_date` | date | Nullable |
| `role` | string | `user` / `hr` / `admin` |
| `is_service` | bool | IT-специалист |
| `user_id` | string | Внешний идентификатор |
| `avatar` | string (URL) | |

### 6.2. Task
| Поле | Тип | Примечание |
|---|---|---|
| `id` | string | `"task_{number}"` |
| `title` | string (500) | |
| `description` | string | |
| `status` | string | `todo` / `in_progress` / `transferred` / `completed` / `failed` / `paused` |
| `priority` | string | `low` / `medium` / `high` / `urgent` |
| `task_type` | string | `single` / `multiple` |
| `creator` | User | |
| `assignees` | User[] (M2M) | Исполнители |
| `assigned_departments` | Department[] (M2M) | Отделы-получатели |
| `completed_by` | User[] (M2M) | Кто выполнил |
| `deadline` | datetime | Nullable |
| `parent_task_id` | string | Родительская задача |
| `branch` | Reference | Филиал |
| `office_number` | string | |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### 6.3. TaskComment
| Поле | Тип | Примечание |
|---|---|---|
| `id` | string | `"comment_{id}"` |
| `content` | string (10000) | |
| `user` | User | Автор |
| `task` | Task | |
| `mentioned_users` | string[] | `user_id` |
| `attachments` | FileAttachment[] | Generic FK |
| `created_at` | datetime | |
| `updated_at` | datetime | Nullable |

### 6.4. Chat
| Поле | Тип | Примечание |
|---|---|---|
| `id` | UUID | |
| `type` | string | `private` / `group` / `task` |
| `name` | string | |
| `creator` | User | |
| `participants` | User[] (M2M) | |
| `task` | Task | Nullable, для task-чатов |
| `last_message` | string | Денормализация |
| `last_message_at` | datetime | |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### 6.5. ChatMessage
| Поле | Тип | Примечание |
|---|---|---|
| `id` | UUID | |
| `chat` | Chat | |
| `sender` | User | |
| `content` | string (10000) | Поддерживает Markdown |
| `mentioned_users` | string[] | |
| `attachments` | FileAttachment[] | Generic FK |
| `created_at` | datetime | |
| `updated_at` | datetime | Nullable |

### 6.6. FileAttachment
| Поле | Тип | Примечание |
|---|---|---|
| `id` | UUID | |
| `original_name` | string (255) | |
| `mime_type` | string (255) | Автоопределение |
| `size` | int (bigint) | Байты |
| `url` | string (URL) | Полный URL файла |
| `uploaded_at` | datetime | |
| `uploaded_by` | User | |

### 6.7. Notification
| Поле | Тип | Примечание |
|---|---|---|
| `id` | int (BigAuto) | |
| `user` | User | Получатель |
| `type` | string | `task_assigned` / `task_status_changed` / `new_comment` / `mention` / `task_completed` / `department_task` |
| `title` | string (200) | |
| `message` | string | |
| `related_task` | Task | Nullable |
| `link` | string (500) | URL для перехода |
| `is_read` | bool | |
| `created_at` | datetime | |

### 6.8. Department
| Поле | Тип | Примечание |
|---|---|---|
| `id` | int | |
| `name` | string (200) | Уникальное |
| `description` | string | |
| `parent_department` | Department | Nullable, self-reference |
| `head` | User | Nullable, руководитель |

### 6.9. Reference (Справочник)
| Поле | Тип | Примечание |
|---|---|---|
| `id` | int | |
| `type` | string | `position` / `branch` |
| `value` | string (200) | |
| Уникальность | `(type, value)` | Case-insensitive |

### 6.10. News
| Поле | Тип | Примечание |
|---|---|---|
| `id` | int | |
| `title` | string (255) | |
| `content` | string | |
| `author` | User | |
| `category` | NewsCategory | Nullable |
| `send_to_all` | bool | |
| `departments` | Department[] (M2M) | |
| `users` | User[] (M2M) | Целевые получатели |
| `expires_at` | datetime | Nullable |
| `is_expired` | bool | |
| `is_pinned` | bool | |

### 6.11. Equipment
| Поле | Тип | Примечание |
|---|---|---|
| `id` | int | |
| `branch` | Reference | Nullable |
| `equipment_type` | string | `printer` / `mfu` / `monitor` / `system_unit` / `monoblock` / `arm_emias` / `other` |
| `model_name` | string (200) | |
| `manufacturer` | string (200) | |
| `serial_number` | string (100) | |
| `inventory_number` | string (100) | |
| `room` | string (50) | |
| `is_working` | bool | Nullable |
| `description` | string | |
| `comment` | string | |

### 6.12. TaskTemplate
| Поле | Тип | Примечание |
|---|---|---|
| `id` | string (slug) | Авто-генерируемый |
| `name` | string (200) | |
| `category` | string | Из фиксированного набора |
| `title_template` | string (500) | |
| `description_template` | string | |
| `priority` | string | Default `medium` |
| `task_type` | string | Default `single` |
| `estimated_days` | int | Default 1 |
| `icon` | string (50) | Default `FileText` |
| `is_system` | bool | Только Admin |
| `is_active` | bool | |

---

## 7. Валидация — сводная таблица

### 7.1. Email
- Формат: валидный email
- Домен: **обязательно** `@zdrav.mos.ru` (case-insensitive)
- Резервный email: любой валидный email

### 7.2. Строковые поля
| Поле | Max длина |
|---|---|
| `username` | 150 |
| `full_name` | 255 |
| `phone` | 20 |
| `office_number` | 20 (50 для задач) |
| `task.title` | 500 |
| `comment.content` | 10 000 |
| `chat_message.content` | 10 000 |
| `department.name` | 200 |
| `reference.value` | 200 |
| `news.title` | 255 |
| `news.link` | 500 |
| `notification.title` | 200 |
| `equipment.model_name` | 200 |
| `equipment.manufacturer` | 200 |
| `equipment.serial_number` | 100 |
| `equipment.inventory_number` | 100 |
| `equipment.room` | 50 |
| `template.title_template` | 500 |
| `template.icon` | 50 |

### 7.3. Числовые поля
| Поле | Тип |
|---|---|
| `FileAttachment.size` | BigInteger (байты) |
| `TaskTemplate.estimated_days` | Integer |

### 7.4. Date/DateTime
- Формат: **ISO 8601** (`YYYY-MM-DDTHH:MM:SS+03:00`)
- `birth_date`: только дата (`YYYY-MM-DD`), не может быть в будущем
- `deadline`, `expires_at`: полный datetime, не может быть в прошлом (для `expires_at`)

### 7.5. Выбор из списка (choices)
| Поле | Значения |
|---|---|
| `Task.status` | `todo`, `in_progress`, `transferred`, `completed`, `failed`, `paused` |
| `Task.priority` | `low`, `medium`, `high`, `urgent` |
| `Task.task_type` | `single`, `multiple` |
| `User.role` | `user`, `hr`, `admin` |
| `Chat.type` | `private`, `group`, `task` |
| `Equipment.equipment_type` | `printer`, `mfu`, `monitor`, `system_unit`, `monoblock`, `arm_emias`, `other` |
| `Notification.type` | `task_assigned`, `task_status_changed`, `new_comment`, `mention`, `task_completed`, `department_task` |
| `OTPVerification.purpose` | `login`, `password_reset`, `reserve_email` |
| `Reference.type` | `position`, `branch` |

### 7.6. Файлы
- Максимальный размер: **10 МБ** (настраивается через `MAX_FILE_SIZE`)
- MIME-тип определяется автоматически сервером
- Пустые файлы отклоняются

---

## 8. Обработка ошибок

Сервер возвращает ошибки в формате:

```json
{
  "data": {
    "field_name": ["Сообщение об ошибке"]
  }
}
```

Пример (400 Bad Request):
```json
{
  "data": {
    "email": ["Обязательное поле."],
    "deadline": ["Дата не может быть в прошлом."]
  }
}
```

Глобальная ошибка:
```json
{
  "detail": "Учетные данные не были предоставлены."
}
```

---

## 9. Рекомендации для мобильного разработчика

### 9.1. Хранение токенов
- Используйте **Secure Storage** (Keychain для iOS, EncryptedSharedPreferences для Android)
- Храните `access_token`, `refresh_token`, и данные пользователя
- При 401 — пробуйте refresh, при неудаче — редирект на экран логина

### 9.2. Offline-режим
- Кешируйте задачи, чаты, пользователей локально (SQLite, Realm, Drift, WatermelonDB)
- Очередь исходящих сообщений: при отсутствии сети — сохраняем в локальную очередь, отправляем при восстановлении
- Для чата: REST endpoint для отправки сообщений + WebSocket для реального времени

### 9.3. WebSocket
- При потере соединения — автоматический reconnect с экспоненциальным backoff
- Отвечайте на `ping` сервера `pong` (иначе сервер отключит через 90 сек)
- При reconnect — подтяните пропущенные сообщения через REST API

### 9.4. Пагинация
- Все списковые endpoints возвращают `next` / `previous` URL
- Используйте `page` и `limit` параметры
- `limit` max = 100

### 9.5. Поиск и фильтрация
- Параметр `search` — полнотекстовый поиск
- Параметр `ordering` — сортировка (`-` = по убыванию, например `-created_at`)
- `django-filter` поддерживает фильтрацию по полям моделей

### 9.6. Изображения и аватары
- Аватары хранятся как URL-строки в поле `user.avatar`
- Файлы задач хранятся отдельно, скачиваются по URL из `FileAttachment.url`

### 9.7. Идентификаторы
- **Пользователи:** числовой `id` ИЛИ строковый `user_id` (формат `user_42`). API принимает оба формата.
- **Задачи:** строковый `api_id` (формат `task_55`) ИЛИ числовой `id`.
- **Чаты, сообщения, файлы:** UUID (строковый формат).

### 9.8. Генерация API-клиента
Рекомендуемый подход:
```bash
# Скачать OpenAPI схему
curl https://flowtask220.ru/api/schema/ -o openapi.json

# Сгенерировать клиент (пример для OpenAPI Generator)
openapi-generator generate -i openapi.json -g kotlin -o ./api-client
# или
openapi-generator generate -i openapi.json -g swift5 -o ./api-client
# или
openapi-generator generate -i openapi.json -g dart-dio -o ./api-client
```

---

## 10. Инфраструктура

| Компонент | Технология |
|---|---|
| Backend | Django 6.0 + DRF 3.17 |
| Real-time | Django Channels (WebSocket) |
| База данных | PostgreSQL |
| Кэш / Pub-Sub | Redis 7 |
| Сервер | Nginx (reverse proxy + SSL) |
| Файлы | Local / S3 (Yandex Cloud) |
| Домен | `https://flowtask220.ru` |

---

## 11. Часовой пояс и локализация

- Серверный часовой пояс: **Europe/Moscow (UTC+3)**
- Все datetime приходят в этом поясе с явным offset (`+03:00`)
- Интерфейс мобильного приложения — на **русском языке**
- Названия статусов, приоритетов и ролей на русском (см. choices в разделе 7.5)

---

## 12. Тестовый аккаунт

Для тестирования запросите у руководителя проекта:
- Email тестового пользователя
- OTP-код (отправляется на email при вызове `/auth/login/`)
- Роль (user / hr / admin) для тестирования различных прав доступа

---

## 13. Контакты

| Роль | Контакт |
|---|---|
| Backend-разработчик | gp220a@ya.ru |
| Документация API | `https://flowtask220.ru/api/redoc/` |

---

**Версия документа:** 1.0  
**Дата:** 08 апреля 2026
