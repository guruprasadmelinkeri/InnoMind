import { useEffect, useState, useRef } from 'react';
import { wsService } from '../services/websocket';
import type { ConnectionStatus, EventCallback } from '../services/websocket';

export const useWebSocket = <T = any>(
  event: string | string[] | null,
  callback?: EventCallback<T>
) => {
  const [status, setStatus] = useState<ConnectionStatus>(wsService.getStatus());
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    // Connect WS on hook mount if offline
    wsService.connect();

    const handleStatusChange = (newStatus: ConnectionStatus) => {
      setStatus(newStatus);
    };

    wsService.subscribeStatus(handleStatusChange);

    if (event) {
      const events = Array.isArray(event) ? event : [event];
      const handler: EventCallback<T> = (payload) => {
        if (savedCallback.current) {
          savedCallback.current(payload);
        }
      };

      events.forEach((e) => wsService.subscribe(e, handler));

      return () => {
        wsService.unsubscribeStatus(handleStatusChange);
        events.forEach((e) => wsService.unsubscribe(e, handler));
      };
    }

    return () => {
      wsService.unsubscribeStatus(handleStatusChange);
    };
  }, [Array.isArray(event) ? event.join(',') : event]);

  return { status };
};
