# Engineering Notebook

[Open Engineering Notebook](https://engineering-notebook-phi.vercel.app/)

A shared workspace for CAD documentation, task assignments, calendars, and resources.

I built this for the CAD team I lead. My goal was to make documentation easier to write and organize, while keeping assignments and resources in the same place.

[Try the demo](https://engineering-notebook-phi.vercel.app/?demo=1#overview) without creating an account. Demo changes reset when you refresh.

## Where it started

My first prototype used Google Docs, with separate tabs for documentation, task delegation, and a calendar. The calendar was essentially Google Sheets in disguise: highlighting days was annoying, and I had to make a new sheet every month.

I also made an [Excalidraw draft](https://excalidraw.com/#json=RTwSG-obfNezIEzVMCP8H,uODf5aBCxz6SY4jm7_o9vA) based on that notebook.

I liked the original formatting, but realized the documentation could quickly become a long list of ungrouped entries. This website builds on those prototypes by organizing entries by mechanism or subsystem and bringing the other tools together.

## Why tasks and documentation belong together

An assignment tells someone what to do. Documentation helps show how the work is progressing.

Without that connection, a part might still be “in progress” when its deadline arrives, with little information about what has actually been done.

I also wanted to avoid conversations like “I think someone else is doing that,” when that person was assigned something entirely different. Clear assignments give everyone a place to check who is responsible.

## Keeping it simple

Everything should be easy to reach. Writing documentation shouldn’t feel like a separate chore, and resources should be nearby as reminders of good CAD practice.

The app includes:

- Documentation grouped by mechanism or subsystem
- Task assignments, statuses, deadlines, and a calendar
- Shared resources, references, and tips
- Team invitations and member or manager access
- Archiving for older entries and tasks

Although I started with my own CAD team in mind, I wanted other teams to be able to use it too. The site is free to use.

## How it was built

I made this for a hackathon using AI to implement most of the application code and help set up the backend. I directed the visual design, features, organization, and revisions.

The Google Docs prototype and Excalidraw draft were the starting points for the project. I’m still learning the implementation, and I don’t claim to have independently written the code.

## What I’d like to improve

- Add video support to documentation
- Send team invitations by email instead of requiring someone to copy and share a link
- Add an interactive viewer for rotating and inspecting 3D models
