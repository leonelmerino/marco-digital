# Despertador

## Por qué funciona así

Una página web no puede despertar a un iPad bloqueado, encender su pantalla,
cambiar el brillo, subir el volumen ni programar una alarma del sistema. Si
iOS bloquea la pantalla o la página pasa a segundo plano, el JavaScript se
congela. Por eso:

- El iPad queda **enchufado**, con **Bloqueo automático en «Nunca»** y el
  marco **al frente** toda la noche.
- La pantalla no se apaga: queda en **negro** (la luz de fondo del iPad Air 1
  sigue encendida; conviene bajar el brillo a mano).
- iOS solo deja sonar audio después de un toque. El toque **Dormir**
  reproduce un silencio corto en los tres `<audio>` (los dos de la radio y el
  del tono), lo que los deja habilitados para sonar después sin toque.
- El volumen es el que quede con los botones del iPad.

## Funcionamiento

| Momento | Qué pasa |
| --- | --- |
| Dormir | Se detienen la radio y las fotos; capa negra con el reloj al 30 % y «⏰ mañana 7:00 · Corazón» arriba. El índice de fotos sigue avanzando. |
| Amanecer (0–30 min antes) | Las fotos vuelven a avanzar y la capa negra se desvanece hasta la hora. |
| Hora | Suena la radio elegida y aparecen **Posponer 5 min** y **Apagar**. Si en 15 s no suena, o falla después, suena `assets/sounds/alarm.wav` (campanita de 3 s en bucle, generada para el proyecto). |
| Posponer | Silencio; vuelve a sonar 5 min después. Arriba queda «⏰ 7:05» con **Apagar**. Se puede repetir. |
| Apagar | Silencio y vuelta al marco normal. |
| Una hora sonando | Se apaga sola. |

- Horarios: lunes a viernes y sábado-domingo, cada uno con hora e interruptor
  (`alarm.js`, guardado en `localStorage` como `alarm.v1`).
- Un control cada 5 s compara con la hora real: un temporizador atrasado no
  retrasa la alarma.
- Si la página se recarga de noche, vuelve al modo noche (`alarm.sleep`). Como
  ya no hubo toque, avisa «toca la pantalla para habilitar el sonido».
- Si la página estuvo congelada más de 2 horas después de la hora, no suena.
- Tocar la pantalla negra muestra **Salir del modo noche** durante 6 s.
- **Probar en 1 minuto**: modo noche con alarma a 1 minuto y 30 s de amanecer.

## Verificación del 10-11-2026 (navegador del Mac)

- Prueba de 1 minuto: amanecer a los 30 s, suena a los 60 s, Corazón sonando
  3 s después; Posponer deja «⏰ 23:58» y la radio callada.
- Con una URL de radio inválida, el tono suena a los 12 s.
- Recarga en modo noche: vuelve al modo noche con el aviso de tocar.
- **Pendiente en el iPad:** que la radio y el tono suenen sin toque tras horas
  de espera, el amanecer con fotos de Dropbox, y una noche completa.
