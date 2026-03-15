/**
 * 404 Not Found Page
 */

export default function NotFoundPage() {
  return (
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>404 - Not Found</title>
        <style>{`
          body {
            background: #0c0720;
            color: #d7ccff;
            font-family: Georgia, serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            text-align: center;
          }
          h1 {
            font-family: 'Orbitron', system-ui, sans-serif;
            color: #ff6b6b;
            font-size: 4rem;
            margin-bottom: 1rem;
          }
          a {
            color: #ffd56b;
            text-decoration: none;
          }
          a:hover { text-decoration: underline; }
        `}</style>
      </head>
      <body>
        <div>
          <h1>404</h1>
          <p>The page you seek does not exist.</p>
          <p><a href="/">Return home</a></p>
        </div>
      </body>
    </html>
  );
}
