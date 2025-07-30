const socket = io();

let name = prompt("Enter your name:");
while (!name || name.trim() === "") {
  name = prompt("Name cannot be empty. Enter your name:");
}
socket.emit("set name", name);

const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");
const usersList = document.getElementById("users-list");

form.addEventListener("submit", function (e) {
  e.preventDefault();
  if (input.value.trim()) {
    socket.emit("chat message", {
      name,
      message: input.value.trim()
    });
    input.value = "";
  }
});

socket.on("chat message", function (data) {
  const item = document.createElement("li");
  const timestamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
  item.textContent = `${data.name} (${timestamp}): ${data.message}`;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
});

socket.on("online users", function (userArray) {
  usersList.innerHTML = ""; // clear previous list
  userArray.forEach((username) => {
    const userItem = document.createElement("li");
    userItem.textContent = username;
    usersList.appendChild(userItem);
  });
});
