const quill = new Quill("#taskEditorContainer", {
  theme: "snow",
  placeholder: "Enter your task here...",
  modules: {
    toolbar: [
      [{ header: "1" }, { header: "2" }, { font: [] }],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ align: [] }],
      ["bold", "italic", "underline", "strike"],
      ["link"],
      [{ color: [] }, { background: [] }],
      ["blockquote", "code-block"],
      ["image"],
      ["video"],
    ],
  },
});

// Add this helper function at the top level
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class TaskManager {
  constructor() {
    this.tasks = JSON.parse(localStorage.getItem("tasks")) || [];
    this.currentFilter = "all";
    this.init();
    this.searchQuery = "";

    // Migrate old tasks to include plainText
    this.tasks = this.tasks.map((task) => {
      if (!task.plainText) {
        return {
          ...task,
          plainText: this.htmlToPlainText(task.content).toLowerCase(),
        };
      }
      return task;
    });
  }

  init() {
    this.initDOM();
    this.initEventListeners();
    this.initCalendar();
    this.initSpeechRecognition();
    this.render();
  }

  initDOM() {
    this.dom = {
      taskList: document.getElementById("taskList"),
      fab: document.getElementById("fab"),
      editorModal: document.getElementById("editorModal"),
      dueDate: document.getElementById("dueDate"),
      voiceButton: document.getElementById("voiceButton"),
      calendar: document.getElementById("calendar"),
      searchInput: document.getElementById("searchInput"),
    };
  }

  initEventListeners() {
    // Event Listeners
    this.dom.fab.addEventListener("click", () => this.toggleEditor());
    document
      .getElementById("saveTask")
      .addEventListener("click", () => this.saveTask());
    document
      .getElementById("cancelEdit")
      .addEventListener("click", () => this.toggleEditor(false));

    document.querySelectorAll(".filters button").forEach((btn) => {
      btn.addEventListener("click", () => this.setFilter(btn.dataset.filter));
    });

    // Mobile menu buttons
    document.querySelectorAll(".mobile-menu button").forEach((btn) => {
      btn.addEventListener("click", () => this.setFilter(btn.dataset.filter));
    });

    this.dom.searchInput.addEventListener("input", (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.render();
    });
  }

  initCalendar() {
    this.calendar = flatpickr(this.dom.calendar, {
      inline: true,
      onChange: (dates) => this.filterByDate(dates[0]),
      onDayCreate: (dObj, dStr, fp, dayElem) => {
        const date = dayElem.dateObj;
        const tasks = this.tasks.filter(
          (task) =>
            task.dueDate && this.isSameDate(new Date(task.dueDate), date)
        );

        if (tasks.length > 0) {
          dayElem.classList.add("has-task");
          if (tasks.some((task) => this.isOverdue(task))) {
            dayElem.classList.add("overdue");
          }
        }
      },
    });
  }

  initSpeechRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.dom.voiceButton.style.display = "none";
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;

    // Voice recognition handlers
    this.recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      const range = quill.getSelection();
      if (range) {
        quill.insertText(range.index, transcript);
      } else {
        quill.insertText(0, transcript);
      }
      this.dom.voiceButton.classList.remove("listening");
    };

    this.recognition.onerror = () => {
      this.dom.voiceButton.classList.remove("listening");
    };

    this.recognition.onend = () => {
      this.dom.voiceButton.classList.remove("listening");
    };

    this.dom.voiceButton.addEventListener("click", () => {
      if (
        this.recognition &&
        !this.dom.voiceButton.classList.contains("listening")
      ) {
        this.recognition.start();
        this.dom.voiceButton.classList.add("listening");
      }
    });
  }

  htmlToPlainText(html) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;

    // Remove any embedded styles or scripts
    tempDiv.querySelectorAll("style, script").forEach((el) => el.remove());

    // Convert bullet lists to text
    tempDiv.querySelectorAll("li").forEach((li) => {
      li.textContent = "• " + li.textContent;
    });

    return tempDiv.textContent
      .replace(/\n\s+/g, "\n") // Remove extra whitespace
      .trim();
  }

  // Core functionality
  saveTask() {
    const taskContent = quill.root.innerHTML;
    const dueDate = this.dom.dueDate.value;
    const plainText = this.htmlToPlainText(taskContent).toLowerCase();

    if (!taskContent.trim()) {
      alert("Please enter a task description");
      return;
    }

    const newTask = {
      id: Date.now(),
      content: taskContent,
      plainText: plainText,
      dueDate,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    this.tasks.push(newTask);
    this.toggleEditor(false);
    quill.setText(""); // Clear editor after save
    this.dom.dueDate.value = "";
    this.saveToLocalStorage();
    this.render();
  }

  render(tasks = this.tasks) {
    const filtered = tasks.filter((task) => {
      if (this.currentFilter === "pending") return !task.completed;
      if (this.currentFilter === "completed") return task.completed;
      return true;
    });

    this.dom.taskList.innerHTML = "";
    filtered.forEach((task) => {
      this.dom.taskList.appendChild(this.createTaskElement(task));
    });

    document.querySelector(".empty-state").style.display = filtered.length
      ? "none"
      : "block";

    this.calendar.redraw();
  }

  createTaskElement(task) {
    const taskCard = document.createElement("div");
    taskCard.classList.add("task-card");
    taskCard.dataset.id = task.id;

    // Convert HTML content to plain text for search highlighting
    const plainText = this.htmlToPlainText(task.content);
    let displayContent = plainText;

    // Apply search highlighting if needed
    if (this.searchQuery && this.searchQuery.length > 0) {
      const regex = new RegExp(`(${escapeRegExp(this.searchQuery)})`, "gi");
      displayContent = plainText.replace(regex, "<mark>$1</mark>");
    }

    // Sanitize the displayed content
    const sanitizedContent = displayContent.replace(/<\/?script>/gi, "");

    // Format due date
    const dueDate = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString()
      : "No due date";

    // Create the HTML structure
    taskCard.innerHTML = `
    <div class="task-content">${sanitizedContent}</div>
    <div class="due-date ${this.isOverdue(task) ? "overdue" : ""}">
      Due: ${dueDate}
    </div>
    <div class="task-actions">
      <label>
        <input type="checkbox" ${task.completed ? "checked" : ""}>
        Mark Complete
      </label>
      <button class="delete-btn">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;

    // Add event listeners
    const checkbox = taskCard.querySelector('input[type="checkbox"]');
    const deleteBtn = taskCard.querySelector(".delete-btn");

    checkbox.addEventListener("change", () =>
      this.toggleTaskCompletion(task.id)
    );
    deleteBtn.addEventListener("click", () => this.deleteTask(task.id));

    return taskCard;
  }

  toggleTaskCompletion(id) {
    const task = this.tasks.find((task) => task.id === id);
    task.completed = !task.completed;
    this.saveToLocalStorage();
    this.render();
  }

  // Modified deleteTask method
  deleteTask(id) {
    const taskElement = document.querySelector(`[data-id="${id}"]`);

    if (taskElement) {
      // Trigger animation
      taskElement.classList.add("delete-animation");

      // Remove after animation completes
      taskElement.addEventListener(
        "animationend",
        () => {
          this.tasks = this.tasks.filter((task) => task.id !== id);
          this.saveToLocalStorage();
          this.render();
        },
        { once: true }
      );
    }
  }

  setFilter(filter) {
    this.currentFilter = filter;
    document.querySelectorAll(".filters button").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.querySelectorAll(".mobile-menu button").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.querySelector(`[data-filter="${filter}"]`).classList.add("active");

    this.render();
  }

  toggleEditor(show = true) {
    this.dom.editorModal.style.display = show ? "flex" : "none";
  }

  isOverdue(task) {
    return task.dueDate && new Date(task.dueDate) < new Date();
  }

  // Improved Date Filtering
  filterByDate(date) {
    const filtered = this.tasks.filter(
      (task) => task.dueDate && this.isSameDate(new Date(task.dueDate), date)
    );
    this.currentFilter = "date";
    this.render(filtered);
  }

  isSameDate(date1, date2) {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  saveToLocalStorage() {
    localStorage.setItem("tasks", JSON.stringify(this.tasks));
  }

  formatText(style) {
    document.execCommand(style);
  }
}

const taskManager = new TaskManager();
