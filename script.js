let currentView = document.querySelector("#overview");
const links = document.querySelectorAll(".navbar a");

links.forEach(function (link) {
    link.addEventListener("click", function (event) {
        event.preventDefault();

        const target = link.getAttribute("href");
        // this basically turns the href into text

        const nextView = document.querySelector(target);

        currentView.hidden = true;
        nextView.hidden = false;
        currentView = nextView;
    });
});

a