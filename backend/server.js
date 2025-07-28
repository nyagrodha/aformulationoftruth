/* Neon-retro theme */
body {
  margin: 0;
  background: #000;
  color: #00ffff;
  font-family: 'Orbitron', sans-serif;
}
nav {
  position: sticky;
  top: 0;
  background: #000;
  padding: 1rem;
}
nav ul {
  list-style: none;
  display: flex;
  gap: 2rem;
  justify-content: center;
}
nav a {
  color: #00ffff;
  text-decoration: none;
  transition: color .3s;
}
nav a:hover {
  color: #ff00ff;
}

.hero {
  height: 80vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: 1rem;
}
.hero h1 {
  font-size: 4rem;
  text-shadow: 0 0 8px #00ffff;
}
.hero p {
  font-size: 1.5rem;
}
.cta {
  display: inline-block;
  padding: .75rem 1.5rem;
  border: 2px solid #ccff00;
  border-radius: 4px;
  text-transform: uppercase;
  transition: background .3s, color .3s;
}
.cta:hover {
  background: #ccff00;
  color: #000;
}
footer {
  text-align: center;
  padding: 1rem 0;
  font-size: .875rem;
  opacity: .6;
}
