export default function LogoMenu() {
  return (
    <details class='logo-menu'>
      <summary class='logo' aria-label='a4முல navigation'>
        <span class='logo-char logo-a'>a</span>
        <span class='logo-char logo-4'>4</span>
        <span class='logo-char logo-mu'>மு</span>
        <span class='logo-char logo-la'>ல</span>
      </summary>
      <div class='logo-dropdown'>
        <a class='logo-link-about' href='/about'>about</a>
        <a class='logo-link-contact' href='/contact.html'>contact</a>
        <a class='logo-link-messenger' href='/contact.html'>messenger</a>
        <a class='logo-link-lotto' href='/lotto.html'>zk lotto</a>
      </div>
    </details>
  );
}
