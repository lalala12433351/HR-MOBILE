/* Desktop Web Push for inbox alerts. No fetch handler, so it does not cache the app. */

self.addEventListener('push', (event) => {
  let data = { title: 'Pixbe', body: 'You have a new notification', url: '/notifications', tag: 'pixbe-notice' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    /* keep the fallback copy */
  }

  event.waitUntil(
    (async () => {
      const target = data.url || '/chat';
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const want = new URL(target, self.location.origin);
      const anyFocused = clients.some((client) => client.focused);
      const conversationId = want.searchParams.get('c');
      const focusedOnThread = Boolean(conversationId) && clients.some((client) => {
        if (!client.focused) return false;
        try {
          const current = new URL(client.url);
          return current.pathname === want.pathname && current.searchParams.get('c') === conversationId;
        } catch (_) {
          return false;
        }
      });
      // Focused tab: inbox bridge / in-app toast owns delivery. Still show+close so Chrome
      // does not throttle future pushes (userVisibleOnly subscriptions require a notification).
      if (anyFocused || focusedOnThread) {
        const tag = data.tag || 'pixbe-mention';
        await self.registration.showNotification(data.title || 'Pixbe', {
          body: data.body || '',
          tag,
          silent: true,
          data: {
            url: target,
            notificationId: data.notificationId || null,
          },
        });
        const open = await self.registration.getNotifications({ tag });
        open.forEach((note) => note.close());
        clients.forEach((client) => {
          try {
            client.postMessage({
              type: 'pixbe-push-seen',
              notificationId: data.notificationId || null,
              tag: data.tag || null,
            });
          } catch (_) {
            /* ignore */
          }
        });
        return;
      }
      await self.registration.showNotification(data.title || 'Pixbe', {
        body: data.body || '',
        tag: data.tag || 'pixbe-mention',
        data: {
          url: target,
          notificationId: data.notificationId || null,
        },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url ? event.notification.data.url : '/chat';
  const target = new URL(raw, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        let sameOrigin = false;
        try {
          sameOrigin = new URL(client.url).origin === self.location.origin;
        } catch (_) {
          sameOrigin = false;
        }
        if (!sameOrigin) continue;
        client.postMessage({ type: 'pixbe-push-open', url: target });
        if (typeof client.navigate === 'function') {
          try {
            await client.navigate(target);
          } catch (_) {
            /* the page handles the postMessage instead */
          }
        }
        await client.focus();
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});
