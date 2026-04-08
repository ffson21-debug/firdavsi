/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   ФИНАНСОВЫЙ ИИ-ЧАТБОТ ДЛЯ МОЛОДЁЖИ КЫРГЫЗСТАНА           ║
 * ║   app.js — Вся бизнес-логика приложения                     ║
 * ║                                                              ║
 * ║   Структура файла:                                           ║
 * ║   1.  Конфигурация (ключ API, модель, системный промт)      ║
 * ║   2.  Состояние приложения                                   ║
 * ║   3.  Инициализация — точка входа                           ║
 * ║   4.  Управление сессиями (создать / загрузить / удалить)   ║
 * ║   5.  Рендер списка сессий в сайдбаре                      ║
 * ║   6.  Рендер сообщений в чате                               ║
 * ║   7.  Отправка сообщения и вызов Groq API                  ║
 * ║   8.  Парсинг Markdown → HTML                               ║
 * ║   9.  Утилиты: время, UUID, прокрутка и т.д.               ║
 * ║   10. Toast-уведомления                                     ║
 * ║   11. Модальное окно подтверждения удаления                 ║
 * ║   12. Обработчики событий UI                                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   1. КОНФИГУРАЦИЯ
   ═══════════════════════════════════════════════════════════════ */

/**
 * Настройки приложения.
 * GROQ_API_KEY — ключ доступа к Groq API.
 * MODEL         — имя модели, которую мы вызываем.
 * MAX_TOKENS    — максимальное число токенов в ответе.
 * TEMPERATURE   — «температура» генерации (0 = строго, 1 = креативно).
 * STORAGE_KEY   — ключ в localStorage для хранения всех сессий.
 * MAX_SESSIONS  — максимальное кол-во сохранённых сессий.
 * MAX_HISTORY   — количество предыдущих сообщений, отправляемых в контекст.
 */
const CONFIG = {
  GROQ_API_KEY : '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',
  MODEL        : 'meta-llama/llama-4-scout-17b-16e-instruct',
  MAX_TOKENS   : 1500,
  TEMPERATURE  : 0.7,
  STORAGE_KEY  : 'finbot_kg_sessions',
  MAX_SESSIONS : 30,
  MAX_HISTORY  : 12,   // Последних 12 сообщений из истории отправляем в контекст
};

/**
 * Системный промт: задаёт «личность» и контекст ИИ-ассистента.
 * Написан на русском, чтобы модель отвечала на русском языке
 * и была ориентирована на реалии Кыргызстана.
 */
const SYSTEM_PROMPT = `Ты — Firdavsi GPT.
Общайся дружелюбно и используй эмодзи в каждом ответе.
Твоя задача — помогать молодым людям разобраться в личных финансах, сбережениях, инвестициях и финансовой грамотности в контексте Кыргызстана, с фокусом на Ош и регионы.

Правила общения:

Отвечай ТОЛЬКО на русском или английском, кратко и понятно.

Используй простой, молодёжный, но профессиональный тон без жаргона.

Учитывай реалии: сомы (KGS), местные банки (Оптима, БакайБанк, RSK, Дос-Кредобанк, Кыргызстан и др.), уровень доходов молодёжи в Оше, Кара-Суу, Узгене, Ноокате и других городах/сёлах.

Приводи конкретные цифры, примеры, советы — не пиши «воду».

Разбивай длинные ответы на абзацы с эмодзи-маркерами для удобства чтения.

Если вопрос не связан с финансами — вежливо переводи разговор к финансовой теме.

Добавляй короткий совет или мотивацию в конце ответов.

Не давай юридических или инвестиционных рекомендаций как официальный советник.

Твои темы:
💰 Личный бюджет и управление расходами
🏦 Банковские вклады и депозиты в КГ
📈 Основы инвестирования (акции, ПИФы, золото, крипта с оговорками)
🎓 Финансы студентов и молодых специалистов
💳 Кредиты, микрозаймы — плюсы и опасности
💸 Сбережения и финансовые цели
🌍 Валюта: доллар, евро vs сом
🏠 Накопления на жильё в Кыргызстане (включая Ош)
📱 Финтех и мобильные платёжные сервисы КГ

О себе:
Я создан 8 апреля 2026 года в Оше. Меня создал Караваев Фирдавси`;

/* ═══════════════════════════════════════════════════════════════
   2. СОСТОЯНИЕ ПРИЛОЖЕНИЯ
   ═══════════════════════════════════════════════════════════════ */

/**
 * Глобальное состояние приложения.
 * sessions       — массив всех сохранённых сессий.
 * currentId      — ID активной (открытой) сессии.
 * isLoading      — флаг: идёт ли сейчас запрос к API.
 * pendingDeleteId — ID сессии, ожидающей подтверждения удаления.
 */
const state = {
  sessions       : [],
  currentId      : null,
  isLoading      : false,
  pendingDeleteId: null,
};

/* ═══════════════════════════════════════════════════════════════
   3. ИНИЦИАЛИЗАЦИЯ
   ═══════════════════════════════════════════════════════════════ */

/**
 * Точка входа: вызывается когда DOM полностью загружен.
 * 1. Инициализирует Lucide-иконки.
 * 2. Загружает сессии из localStorage.
 * 3. Открывает последнюю сессию или создаёт новую.
 * 4. Навешивает обработчики событий.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Инициализируем SVG-иконки от Lucide
  if (window.lucide) lucide.createIcons();

  // Загружаем сохранённые сессии из localStorage
  loadSessionsFromStorage();

  // Открываем последнюю сессию, если она есть; иначе создаём новую
  if (state.sessions.length > 0) {
    openSession(state.sessions[0].id);
  } else {
    createNewSession();
  }

  // Подключаем все слушатели событий
  bindEventListeners();
});

/* ═══════════════════════════════════════════════════════════════
   4. УПРАВЛЕНИЕ СЕССИЯМИ
   ═══════════════════════════════════════════════════════════════ */

/**
 * Загружает массив сессий из localStorage в state.sessions.
 * Если данные испорчены или отсутствуют — стартует с пустым массивом.
 */
function loadSessionsFromStorage() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    state.sessions = raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('[FinBot] Ошибка чтения из localStorage:', err);
    state.sessions = [];
  }
}

/**
 * Сохраняет текущий state.sessions в localStorage.
 * Вызывается каждый раз после изменения данных.
 */
function saveSessionsToStorage() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.sessions));
  } catch (err) {
    // Если превышен лимит localStorage (~5 МБ) — удаляем самую старую сессию
    if (err.name === 'QuotaExceededError') {
      if (state.sessions.length > 1) {
        state.sessions.pop(); // Удаляем последнюю (самую старую)
        saveSessionsToStorage(); // Рекурсивно пробуем снова
      }
      showToast('Хранилище переполнено, старый чат удалён', 'error');
    }
  }
}

/**
 * Создаёт новую сессию чата.
 * @returns {string} ID созданной сессии.
 */
function createNewSession() {
  // Если текущая активная сессия пустая — не создаём ещё одну
  if (state.currentId) {
    const current = getSessionById(state.currentId);
    if (current && current.messages.length === 0) {
      renderSessionList();
      return state.currentId;
    }
  }

  const session = {
    id       : generateId(),
    name     : 'Новый чат',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages : [],        // Массив объектов { role, content, time }
  };

  // Вставляем новую сессию в начало списка
  state.sessions.unshift(session);

  // Если сессий слишком много — удаляем самую старую
  if (state.sessions.length > CONFIG.MAX_SESSIONS) {
    state.sessions.pop();
  }

  saveSessionsToStorage();
  openSession(session.id);
  return session.id;
}

/**
 * Открывает сессию по её ID:
 * — устанавливает currentId,
 * — обновляет заголовок,
 * — рендерит сообщения,
 * — обновляет список сессий в сайдбаре.
 * @param {string} id — ID сессии.
 */
function openSession(id) {
  const session = getSessionById(id);
  if (!session) return;

  state.currentId = id;

  // Обновляем заголовок чата
  DOM.chatTitle.textContent = session.name;

  // Перерисовываем сообщения
  renderMessages(session.messages);

  // Обновляем активный элемент в списке сессий
  renderSessionList();

  // Прокручиваем вниз
  scrollToBottom(true);
}

/**
 * Удаляет сессию по ID.
 * Если удаляемая сессия была активной — открываем соседнюю или создаём новую.
 * @param {string} id — ID сессии для удаления.
 */
function deleteSession(id) {
  const idx = state.sessions.findIndex(s => s.id === id);
  if (idx === -1) return;

  state.sessions.splice(idx, 1);
  saveSessionsToStorage();

  // Если удалили текущую сессию
  if (state.currentId === id) {
    if (state.sessions.length > 0) {
      // Открываем ближайшую сессию
      const nextSession = state.sessions[Math.min(idx, state.sessions.length - 1)];
      openSession(nextSession.id);
    } else {
      // Создаём новую
      state.currentId = null;
      createNewSession();
    }
  } else {
    // Просто перерисовываем список
    renderSessionList();
  }

  showToast('Чат удалён', 'success');
}
function addBubble(text, isUser = false) {
    const bubble = document.createElement('div');
    bubble.className = isUser ? 'bubble user' : 'bubble bot';
    bubble.innerText = text;

    // если это сообщение бота — добавляем кнопку копирования
    if (!isUser) {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.innerText = '⧉';

        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(text)
                .then(() => {
                    copyBtn.innerText = '✓';
                    setTimeout(() => copyBtn.innerText = '⧉', 1000);
                })
                .catch(err => {
                    console.error('Ошибка копирования:', err);
                });
        });

        bubble.appendChild(copyBtn);
    }

    document.querySelector('#chat').appendChild(bubble);
}

/**
 * Добавляет сообщение в текущую сессию и сохраняет в localStorage.
 * @param {string} role    — 'user' или 'assistant'.
 * @param {string} content — текст сообщения.
 */
function addMessageToSession(role, content) {
  const session = getCurrentSession();
  if (!session) return;

  const msg = {
    id     : generateId(),
    role,
    content,
    time   : Date.now(),
  };

  session.messages.push(msg);
  session.updatedAt = Date.now();

  // Автоматически генерируем название сессии из первого сообщения пользователя
  if (role === 'user' && session.messages.length === 1) {
    session.name = generateSessionName(content);
    DOM.chatTitle.textContent = session.name;
  }

  saveSessionsToStorage();
  return msg;
}

/**
 * Возвращает объект текущей активной сессии или null.
 * @returns {object|null}
 */
function getCurrentSession() {
  return getSessionById(state.currentId);
}

/**
 * Ищет сессию по ID.
 * @param {string} id
 * @returns {object|null}
 */
function getSessionById(id) {
  return state.sessions.find(s => s.id === id) || null;
}

/**
 * Генерирует короткое название сессии из первого сообщения.
 * Берём первые 40 символов текста.
 * @param {string} text
 * @returns {string}
 */
function generateSessionName(text) {
  const clean = text.replace(/\n/g, ' ').trim();
  return clean.length > 40 ? clean.slice(0, 38) + '…' : clean;
}

/* ═══════════════════════════════════════════════════════════════
   5. РЕНДЕР СПИСКА СЕССИЙ В САЙДБАРЕ
   ═══════════════════════════════════════════════════════════════ */

/**
 * Перерисовывает список сессий в боковой панели.
 * Показывает заглушку «Чатов пока нет», если сессий нет.
 */
function renderSessionList() {
  const list  = DOM.sessionsList;
  const empty = DOM.sessionsEmpty;

  if (state.sessions.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = 'flex';
    return;
  }

  // Скрываем заглушку
  empty.style.display = 'none';

  // Строим HTML для каждой сессии
  const html = state.sessions.map(session => {
    const isActive = session.id === state.currentId;
    const dateStr  = formatRelativeTime(session.updatedAt);

    return `
      <div
        class="session-item ${isActive ? 'active' : ''}"
        data-session-id="${session.id}"
        role="button"
        tabindex="0"
        aria-label="Открыть чат: ${escapeHtml(session.name)}"
      >
        <div class="session-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div class="session-info">
          <div class="session-name">${escapeHtml(session.name)}</div>
          <div class="session-date">${dateStr}</div>
        </div>
        <button
          class="session-delete-btn"
          data-delete-id="${session.id}"
          aria-label="Удалить чат"
          title="Удалить чат"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  list.innerHTML = html;

  // Навешиваем обработчики на новые элементы
  list.querySelectorAll('.session-item').forEach(item => {
    const sid = item.dataset.sessionId;

    // Клик по всей карточке — открываем сессию
    item.addEventListener('click', (e) => {
      // Если нажали именно на кнопку удаления — не открываем
      if (e.target.closest('.session-delete-btn')) return;
      openSession(sid);
      closeSidebarOnMobile();
    });

    // Поддержка клавиатуры (Enter / Space)
    item.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.session-delete-btn')) {
        e.preventDefault();
        openSession(sid);
        closeSidebarOnMobile();
      }
    });
  });

  // Обработчики кнопок удаления сессий
  list.querySelectorAll('.session-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteId;
      confirmDelete(id);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   6. РЕНДЕР СООБЩЕНИЙ
   ═══════════════════════════════════════════════════════════════ */

/**
 * Полностью перерисовывает область сообщений.
 * Показывает / скрывает приветственный экран.
 * @param {Array} messages — массив объектов сообщений.
 */
function renderMessages(messages) {
  const list    = DOM.messagesList;
  const welcome = DOM.welcomeScreen;

  if (!messages || messages.length === 0) {
    // Пустой чат — показываем приветствие
    list.innerHTML = '';
    welcome.style.display = 'flex';
    return;
  }

  // Есть сообщения — скрываем приветствие
  welcome.style.display = 'none';

  // Рендерим каждое сообщение
  list.innerHTML = messages.map(msg => buildMessageHTML(msg)).join('');

  // Прокрутка вниз после рендера
  scrollToBottom(true);
}

/**
 * Добавляет одно новое сообщение в DOM без полного перерисовывания.
 * Это эффективнее чем renderMessages() для каждого нового сообщения.
 * @param {object} msg — объект сообщения { id, role, content, time }.
 */
function appendMessageToDOM(msg) {
  const list    = DOM.messagesList;
  const welcome = DOM.welcomeScreen;

  // Скрываем приветствие при первом сообщении
  welcome.style.display = 'none';

  // Создаём DOM-элемент
  const div = document.createElement('div');
  div.innerHTML = buildMessageHTML(msg);
  const el = div.firstElementChild;

  list.appendChild(el);
  scrollToBottom();
}

/**
 * Строит HTML-строку одного сообщения.
 * @param {object} msg — { role, content, time }.
 * @returns {string} HTML.
 */
function buildMessageHTML(msg) {
  const isUser    = msg.role === 'user';
  const isError   = msg.role === 'error';
  const timeStr   = formatTime(msg.time);
  const avatarStr = isUser ? 'Я' : '₿';  // Аватар: инициал пользователя или символ

  // Парсим Markdown в HTML только для сообщений бота
  let contentHtml;
  if (isUser) {
    contentHtml = escapeHtml(msg.content);
  } else if (isError) {
    contentHtml = `<div class="error-title">⚠️ Ошибка</div>${escapeHtml(msg.content)}`;
  } else {
    contentHtml = parseMarkdown(msg.content);
  }

  const bubbleClass = isError ? 'message-bubble error' : 'message-bubble';

  return `
    <div class="message ${isUser ? 'user' : 'bot'}" data-msg-id="${msg.id || ''}">
      <div class="message-avatar">${avatarStr}</div>
      <div class="message-body">
        <div class="${bubbleClass}">${contentHtml}</div>
        <div class="message-time">${timeStr}</div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   7. ОТПРАВКА СООБЩЕНИЯ И ВЫЗОВ GROQ API
   ═══════════════════════════════════════════════════════════════ */

/**
 * Главная функция отправки сообщения.
 * 1. Читает текст из поля ввода.
 * 2. Добавляет сообщение пользователя в чат.
 * 3. Вызывает Groq API.
 * 4. Добавляет ответ бота в чат.
 */
async function sendMessage() {
  const input = DOM.messageInput;
  const text  = input.value.trim();

  // Не отправляем пустые сообщения
  if (!text || state.isLoading) return;

  // Блокируем UI на время запроса
  setLoadingState(true);

  // Очищаем поле ввода и сбрасываем его высоту
  input.value = '';
  autoResizeTextarea(input);
  updateCharCounter(0);

  // Добавляем сообщение пользователя
  const userMsg = addMessageToSession('user', text);
  appendMessageToDOM(userMsg);

  // Показываем индикатор «печатает...»
  showTypingIndicator(true);

  try {
    // Формируем историю для контекста (последние N сообщений)
    const session  = getCurrentSession();
    const history  = buildApiMessages(session.messages);

    // Запрос к Groq API
    const response = await callGroqAPI(history);

    // Скрываем индикатор печатания
    showTypingIndicator(false);

    // Добавляем ответ бота
    const botMsg = addMessageToSession('assistant', response);
    appendMessageToDOM(botMsg);

    // Обновляем список сессий (обновится время)
    renderSessionList();

  } catch (err) {
    showTypingIndicator(false);

    // Определяем понятное сообщение об ошибке для пользователя
    const errorText = getErrorMessage(err);

    // Показываем ошибку как сообщение бота
    const errMsg = {
      id   : generateId(),
      role : 'error',
      content: errorText,
      time : Date.now(),
    };
    appendMessageToDOM(errMsg);

    console.error('[FinBot] Ошибка API:', err);
  } finally {
    // Разблокируем UI
    setLoadingState(false);
    input.focus();
  }
}

/**
 * Отправляет запрос к Groq API.
 * @param {Array} messages — массив объектов { role, content }.
 * @returns {Promise<string>} — текст ответа модели.
 */
async function callGroqAPI(messages) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const payload = {
    model      : CONFIG.MODEL,
    messages   : [
      // Системный промт всегда идёт первым
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ],
    max_tokens   : CONFIG.MAX_TOKENS,
    temperature  : CONFIG.TEMPERATURE,
    stream       : false,
  };

  const response = await fetch(url, {
    method : 'POST',
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  // Обрабатываем HTTP-ошибки
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const apiError = errData?.error?.message || `HTTP ${response.status}`;
    throw new Error(apiError);
  }

  const data = await response.json();

  // Извлекаем текст ответа из структуры OpenAI-совместимого API
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Пустой ответ от API');

  return content;
}

/**
 * Формирует массив сообщений для API с учётом лимита контекста.
 * Берём последние MAX_HISTORY сообщений из истории.
 * Роли 'error' фильтруем — API не знает такой роли.
 * @param {Array} messages — все сообщения сессии.
 * @returns {Array} — сообщения в формате {role, content}.
 */
function buildApiMessages(messages) {
  return messages
    .filter(m => m.role !== 'error')        // Убираем служебные сообщения об ошибках
    .slice(-CONFIG.MAX_HISTORY)              // Берём только последние N
    .map(m => ({
      role   : m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));
}

/**
 * Переводит технические ошибки в понятные русские сообщения.
 * @param {Error} err
 * @returns {string}
 */
function getErrorMessage(err) {
  const msg = err.message || '';

  if (msg.includes('401') || msg.includes('invalid_api_key')) {
    return 'Ошибка авторизации: неверный API-ключ. Проверьте настройки.';
  }
  if (msg.includes('429') || msg.includes('rate_limit')) {
    return 'Слишком много запросов. Подождите немного и попробуйте снова.';
  }
  if (msg.includes('503') || msg.includes('overloaded')) {
    return 'Сервер сейчас перегружен. Пожалуйста, повторите через несколько секунд.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Нет соединения с интернетом. Проверьте подключение и попробуйте снова.';
  }
  if (msg.includes('model_not_found')) {
    return 'Указанная модель недоступна. Обратитесь к разработчику.';
  }
  if (msg.includes('context_length_exceeded')) {
    return 'Контекст чата слишком длинный. Начните новый чат.';
  }
  if (msg.includes('Пустой ответ')) {
    return 'Бот не дал ответа. Попробуйте ещё раз или перефразируйте вопрос.';
  }

  // Общая ошибка
  return `Не удалось получить ответ: ${msg || 'неизвестная ошибка'}. Попробуйте снова.`;
}

/* ═══════════════════════════════════════════════════════════════
   8. ПАРСИНГ MARKDOWN → HTML
   ═══════════════════════════════════════════════════════════════ */

/**
 * Простой Markdown-парсер для ответов бота.
 * Поддерживает: заголовки, жирный, курсив, код, цитаты,
 * горизонтальные линии, нумерованные и маркированные списки,
 * параграфы.
 * @param {string} text — сырой Markdown-текст.
 * @returns {string} — HTML-строка.
 */
function parseMarkdown(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // ── Блок кода (```lang\n...\n```) ──
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // ── Инлайн-код (`code`) ──
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // ── Заголовки ### / ## / # ──
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // ── Горизонтальная линия --- ──
  html = html.replace(/^[-*_]{3,}$/gm, '<hr>');

  // ── Жирный текст **text** или __text__ ──
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g,      '<strong>$1</strong>');

  // ── Курсив *text* или _text_ (не трогаем то, что уже стало тегом) ──
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g,       '<em>$1</em>');

  // ── Цитата > text ──
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // ── Нумерованные списки (1. ...) ──
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (match) => {
    const items = match.trim().split('\n').map(line => {
      return `<li>${line.replace(/^\d+\. /, '')}</li>`;
    }).join('');
    return `<ol>${items}</ol>`;
  });

  // ── Маркированные списки (- ... или * ...) ──
  html = html.replace(/((?:^[-*+] .+\n?)+)/gm, (match) => {
    const items = match.trim().split('\n').map(line => {
      return `<li>${line.replace(/^[-*+] /, '')}</li>`;
    }).join('');
    return `<ul>${items}</ul>`;
  });

  // ── Переносы строк → параграфы ──
  // Разбиваем по двойному переносу (пустая строка между блоками)
  const blocks = html.split(/\n{2,}/);
  html = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    // Уже является HTML-тегом — не оборачиваем
    if (/^<(h[1-6]|ul|ol|pre|blockquote|hr)/.test(block)) return block;
    // Одиночные переносы внутри параграфа
    block = block.replace(/\n/g, '<br>');
    return `<p>${block}</p>`;
  }).filter(Boolean).join('\n');

  return html;
}

/* ═══════════════════════════════════════════════════════════════
   9. УТИЛИТЫ
   ═══════════════════════════════════════════════════════════════ */

/**
 * Генерирует псевдо-уникальный ID.
 * Используем Math.random + timestamp для простоты.
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Экранирует HTML-спецсимволы для предотвращения XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

/**
 * Форматирует timestamp в читаемое время: «14:32».
 * @param {number} timestamp — ms с эпохи.
 * @returns {string}
 */
function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Форматирует timestamp в относительное время: «сегодня», «вчера», «3 дня назад».
 * @param {number} timestamp
 * @returns {string}
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const now      = Date.now();
  const diffMs   = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs  = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMins < 1)   return 'только что';
  if (diffMins < 60)  return `${diffMins} мин назад`;
  if (diffHrs  < 24)  return `${diffHrs} ч назад`;
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7)   return `${diffDays} дн назад`;

  const d = new Date(timestamp);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * Прокручивает область сообщений вниз.
 * @param {boolean} instant — мгновенно (true) или плавно (false).
 */
function scrollToBottom(instant = false) {
  const wrap = DOM.messagesWrap;
  if (!wrap) return;
  wrap.scrollTo({
    top     : wrap.scrollHeight,
    behavior: instant ? 'auto' : 'smooth',
  });
}

/**
 * Авторасширение textarea по содержимому.
 * @param {HTMLTextAreaElement} el
 */
function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

/**
 * Обновляет счётчик введённых символов.
 * @param {number} count — текущее кол-во символов.
 */
function updateCharCounter(count) {
  const counter = DOM.charCounter;
  counter.textContent = `${count} / 2000`;
  counter.classList.remove('warn', 'limit');
  if (count > 1800) counter.classList.add('warn');
  if (count >= 2000) counter.classList.add('limit');
}

/**
 * Устанавливает состояние загрузки (запрос к API):
 * блокирует / разблокирует кнопку отправки и поле ввода.
 * @param {boolean} loading
 */
function setLoadingState(loading) {
  state.isLoading          = loading;
  DOM.sendBtn.disabled     = loading || !DOM.messageInput.value.trim();
  DOM.messageInput.disabled = loading;

  if (!loading) {
    // После ответа снова активируем кнопку если есть текст
    DOM.sendBtn.disabled = !DOM.messageInput.value.trim();
  }
}

/**
 * Показывает / скрывает индикатор «печатает…».
 * @param {boolean} visible
 */
function showTypingIndicator(visible) {
  DOM.typingIndicator.style.display = visible ? 'flex' : 'none';
  if (visible) scrollToBottom();
}

/* ═══════════════════════════════════════════════════════════════
   10. TOAST-УВЕДОМЛЕНИЯ
   ═══════════════════════════════════════════════════════════════ */

/**
 * Показывает всплывающее уведомление.
 * @param {string} message  — текст уведомления.
 * @param {'success'|'error'|'info'} type — тип уведомления.
 * @param {number} duration — время показа в мс (по умолчанию 3000).
 */
function showToast(message, type = 'info', duration = 3000) {
  const container = DOM.toastContainer;

  // Иконка в зависимости от типа
  const icons = {
    success: '✓',
    error  : '✕',
    info   : 'ℹ',
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  // Автоматически скрываем через duration мс
  setTimeout(() => {
    toast.classList.add('hide');
    // Удаляем из DOM после завершения анимации
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

/* ═══════════════════════════════════════════════════════════════
   11. МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ
   ═══════════════════════════════════════════════════════════════ */

/**
 * Открывает модальное окно подтверждения удаления сессии.
 * @param {string} id — ID сессии для удаления.
 */
function confirmDelete(id) {
  state.pendingDeleteId = id;
  DOM.deleteModal.style.display = 'flex';
}

/**
 * Закрывает модальное окно без действий.
 */
function closeModal() {
  state.pendingDeleteId = null;
  DOM.deleteModal.style.display = 'none';
}

/**
 * Выполняет подтверждённое удаление сессии.
 */
function confirmDeleteAction() {
  if (state.pendingDeleteId) {
    deleteSession(state.pendingDeleteId);
  }
  closeModal();
}

/* ═══════════════════════════════════════════════════════════════
   12. КЭШИРОВАНИЕ DOM-ЭЛЕМЕНТОВ И ОБРАБОТЧИКИ СОБЫТИЙ
   ═══════════════════════════════════════════════════════════════ */

/**
 * Кэш DOM-элементов — запрашиваем каждый элемент один раз.
 * Использование: DOM.sendBtn, DOM.messageInput и т.д.
 */
const DOM = {
  // Сайдбар
  sidebar        : document.getElementById('sidebar'),
  sidebarOverlay : document.getElementById('sidebarOverlay'),
  sidebarCloseBtn: document.getElementById('sidebarCloseBtn'),
  sessionsList   : document.getElementById('sessionsList'),
  sessionsEmpty  : document.getElementById('sessionsEmpty'),
  newChatBtn     : document.getElementById('newChatBtn'),

  // Шапка чата
  menuBtn        : document.getElementById('menuBtn'),
  chatTitle      : document.getElementById('chatTitle'),
  deleteChatBtn  : document.getElementById('deleteChatBtn'),

  // Область сообщений
  messagesWrap   : document.getElementById('messagesWrap'),
  messagesList   : document.getElementById('messagesList'),
  welcomeScreen  : document.getElementById('welcomeScreen'),
  typingIndicator: document.getElementById('typingIndicator'),

  // Поле ввода
  messageInput   : document.getElementById('messageInput'),
  charCounter    : document.getElementById('charCounter'),
  sendBtn        : document.getElementById('sendBtn'),

  // Модальное окно
  deleteModal    : document.getElementById('deleteModal'),
  modalCancelBtn : document.getElementById('modalCancelBtn'),
  modalConfirmBtn: document.getElementById('modalConfirmBtn'),

  // Toast
  toastContainer : document.getElementById('toastContainer'),
};

/**
 * Подключает все обработчики событий UI.
 * Вызывается один раз при инициализации.
 */
function bindEventListeners() {

  /* ── Кнопка «Новый чат» ── */
  DOM.newChatBtn.addEventListener('click', () => {
    createNewSession();
    closeSidebarOnMobile();
  });

  /* ── Поле ввода сообщения ── */
  DOM.messageInput.addEventListener('input', () => {
    const len = DOM.messageInput.value.length;
    autoResizeTextarea(DOM.messageInput);
    updateCharCounter(len);
    // Активируем/деактивируем кнопку отправки
    DOM.sendBtn.disabled = len === 0 || state.isLoading;
  });

  /* ── Отправка по Enter (Shift+Enter = новая строка) ── */
  DOM.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  /* ── Кнопка отправки ── */
  DOM.sendBtn.addEventListener('click', sendMessage);

  /* ── Кнопка удаления текущего чата ── */
  DOM.deleteChatBtn.addEventListener('click', () => {
    if (state.currentId) {
      confirmDelete(state.currentId);
    }
  });

  /* ── Бургер-меню (мобильные) ── */
  DOM.menuBtn.addEventListener('click', openSidebar);
  DOM.sidebarCloseBtn.addEventListener('click', closeSidebar);
  DOM.sidebarOverlay.addEventListener('click', closeSidebar);

  /* ── Быстрые подсказки (кнопки приветственного экрана) ── */
  document.querySelectorAll('.quick-prompt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      if (prompt) {
        DOM.messageInput.value = prompt;
        autoResizeTextarea(DOM.messageInput);
        updateCharCounter(prompt.length);
        DOM.sendBtn.disabled = false;
        sendMessage();
      }
    });
  });

  /* ── Модальное окно ── */
  DOM.modalCancelBtn.addEventListener('click', closeModal);
  DOM.modalConfirmBtn.addEventListener('click', confirmDeleteAction);

  // Закрытие модального окна кликом по фону
  DOM.deleteModal.addEventListener('click', (e) => {
    if (e.target === DOM.deleteModal) closeModal();
  });

  // Закрытие модального окна по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (DOM.deleteModal.style.display !== 'none') closeModal();
      if (DOM.sidebar.classList.contains('open')) closeSidebar();
    }
  });
}

/* ── Управление сайдбаром на мобильных ── */

/**
 * Открывает боковую панель на мобильных устройствах.
 */
function openSidebar() {
  DOM.sidebar.classList.add('open');
  DOM.sidebarOverlay.classList.add('active');
  document.body.style.overflow = 'hidden'; // Запрещаем прокрутку body
}

/**
 * Закрывает боковую панель на мобильных устройствах.
 */
function closeSidebar() {
  DOM.sidebar.classList.remove('open');
  DOM.sidebarOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

/**
 * Закрывает сайдбар только если экран мобильный (≤700px).
 */
function closeSidebarOnMobile() {
  if (window.innerWidth <= 700) closeSidebar();
}
