const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");

let products = [];
const selected = new Set();
let chatHistory = [];

/* Load all products once */
async function loadProducts() {
  const res = await fetch("products.json");
  const data = await res.json();
  products = data.products;
  restoreSelectedFromStorage();
}

/* Display products with data-id and description toggle */
function displayProducts(productsToShow) {
  if (productsToShow.length === 0) {
    productsContainer.innerHTML = `<p class="placeholder-message">No products found.</p>`;
    return;
  }
  productsContainer.innerHTML = productsToShow
    .map(
      (p) => `
      <div class="product-card" data-id="${p.id}">
        <img src="${p.image}" alt="${p.name}">
        <div class="product-info">
          <h3>${p.name}</h3>
          <p>${p.brand}</p>
          <button class="desc-toggle" aria-expanded="false" aria-controls="desc-${p.id}">
            Description <i class="fa-solid fa-caret-down"></i>
          </button>
          <p id="desc-${p.id}" class="description" hidden>${p.description}</p>
        </div>
      </div>`
    )
    .join("");

  /* Add event listeners for product selection and description toggling */
  document.querySelectorAll(".product-card").forEach((card) => {
    const id = card.dataset.id;

    /* Highlight selected products */
    if (selected.has(id)) card.classList.add("selected");
    else card.classList.remove("selected");

    /* Select/unselect product on click */
    card.onclick = (e) => {
      /* Prevent toggling when clicking description button */
      if (e.target.closest(".desc-toggle")) return;

      if (selected.has(id)) {
        selected.delete(id);
        card.classList.remove("selected");
      } else {
        selected.add(id);
        card.classList.add("selected");
      }
      updateSelectedUI();
      saveSelectedToStorage();
    };

    /* Description toggle button */
    const descToggle = card.querySelector(".desc-toggle");
    const descPara = card.querySelector(".description");
    descToggle.onclick = (e) => {
      e.stopPropagation();
      const expanded = descToggle.getAttribute("aria-expanded") === "true";
      descToggle.setAttribute("aria-expanded", String(!expanded));
      if (expanded) {
        descPara.hidden = true;
        descToggle.querySelector("i").classList.replace("fa-caret-up", "fa-caret-down");
      } else {
        descPara.hidden = false;
        descToggle.querySelector("i").classList.replace("fa-caret-down", "fa-caret-up");
      }
    };
  });
}

/* Update Selected Products UI list */
function updateSelectedUI() {
  if (selected.size === 0) {
    selectedProductsList.innerHTML = `<p>No products selected.</p>`;
    return;
  }

  selectedProductsList.innerHTML = "";
  selected.forEach((id) => {
    const p = products.find((x) => x.id == id);
    const div = document.createElement("div");
    div.className = "selected-product-item";
    div.innerHTML = `
      <span>${p.name} (${p.brand})</span>
      <button aria-label="Remove ${p.name}" class="remove-btn" data-id="${id}">&times;</button>
    `;
    selectedProductsList.appendChild(div);
  });

  /* Add remove button functionality */
  selectedProductsList.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      selected.delete(id);
      document.querySelector(`.product-card[data-id="${id}"]`)?.classList.remove("selected");
      updateSelectedUI();
      saveSelectedToStorage();
    };
  });
}

/* Save selected products to localStorage */
function saveSelectedToStorage() {
  localStorage.setItem("selectedProducts", JSON.stringify(Array.from(selected)));
}

/* Restore selected products from localStorage */
function restoreSelectedFromStorage() {
  const saved = JSON.parse(localStorage.getItem("selectedProducts") || "[]");
  saved.forEach((id) => selected.add(String(id)));
  updateSelectedUI();
}

/* Filter products on category selection */
categoryFilter.addEventListener("change", () => {
  const filtered = products.filter((p) => p.category === categoryFilter.value);
  displayProducts(filtered);
});

/* Generate routine using OpenAI API via Cloudflare Worker */
generateRoutineBtn.onclick = async () => {
  if (selected.size === 0) {
    alert("Please select at least one product.");
    return;
  }

  // Prepare prompt data
  const selectedProductsData = Array.from(selected).map((id) => {
    const p = products.find((x) => x.id == id);
    return {
      name: p.name,
      brand: p.brand,
      category: p.category,
      description: p.description,
    };
  });

  // Add user message to chat history
  chatHistory.push({
    role: "user",
    content: `Please create a personalized skincare/haircare routine using the following products:\n${JSON.stringify(selectedProductsData, null, 2)}`,
  });

  appendChatMessage("Generating your routine...", "bot");

  // Call Cloudflare Worker API
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: chatHistory }),
    });
    const data = await response.json();
    if (data.reply) {
      chatHistory.push({ role: "bot", content: data.reply });
      appendChatMessage(data.reply, "bot");
    } else {
      appendChatMessage("Sorry, I didn't get a response. Try again.", "bot");
    }
  } catch (error) {
    appendChatMessage("Error connecting to AI service.", "bot");
    console.error(error);
  }
};

/* Append message to chat window */
function appendChatMessage(message, sender) {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("chat-message", sender === "user" ? "user-message" : "bot-message");
  msgDiv.textContent = message;
  chatWindow.appendChild(msgDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Handle chat form submit for follow-up questions */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = userInput.value.trim();
  if (!question) return;

  // Add user question to chat window & history
  appendChatMessage(question, "user");
  chatHistory.push({ role: "user", content: question });
  userInput.value = "";

  // Call Cloudflare Worker API with full chat history
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: chatHistory }),
    });
    const data = await response.json();
    if (data.reply) {
      chatHistory.push({ role: "bot", content: data.reply });
      appendChatMessage(data.reply, "bot");
    } else {
      appendChatMessage("Sorry, I couldn't answer that.", "bot");
    }
  } catch (error) {
    appendChatMessage("Error connecting to AI service.", "bot");
    console.error(error);
  }
});

/* Initialize */
(async () => {
  await loadProducts();
  productsContainer.innerHTML = `<p class="placeholder-message">Select a category to view products</p>`;
  restoreSelectedFromStorage();
})();
