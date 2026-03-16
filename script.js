const button = document.getElementById("pingButton");
const status = document.getElementById("status");

button.addEventListener("click", () => {
  const now = new Date().toLocaleString("es-UY");
  status.textContent = `Estado: click registrado a las ${now}.`;
});
