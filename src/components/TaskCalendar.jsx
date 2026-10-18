// Month navigation and task dots. Selecting a date filters the overview timeline.
import { useState } from "react";

export function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function TaskCalendar({ tasks, selectedDay, onSelect }) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const first = new Date(
    month.getFullYear(),
    month.getMonth(),
    1 - month.getDay(),
  );
  function move(offset) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));
    onSelect("");
  }
  return (
    <section className="panel calendar-panel" aria-label="Task calendar">
      <div className="panel-heading">
        <h2 id="calendar-month">
          {month.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <div className="calendar-controls">
          <button
            type="button"
            id="calendar-previous"
            aria-label="Previous month"
            onClick={() => move(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            id="calendar-today"
            onClick={() => {
              setMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              );
              onSelect("");
            }}
          >
            Today
          </button>
          <button
            type="button"
            id="calendar-next"
            aria-label="Next month"
            onClick={() => move(1)}
          >
            ›
          </button>
        </div>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <span key={index}>{day}</span>
        ))}
      </div>
      <div id="calendar-days" className="calendar-days">
        {Array.from({ length: 42 }, (_, offset) => {
          const day = new Date(
            first.getFullYear(),
            first.getMonth(),
            first.getDate() + offset,
          );
          const key = dateKey(day);
          const due = tasks.filter(
            (task) => !task.archived && task.data.due === key,
          );
          const classes = [
            "calendar-day",
            day.getMonth() !== month.getMonth() && "outside-month",
            key === dateKey(new Date()) && "today",
            due.length > 0 && "has-tasks",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              type="button"
              key={key}
              className={classes}
              aria-pressed={key === selectedDay}
              aria-label={
                day.toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }) +
                ": " +
                due.length +
                " tasks"
              }
              title={
                due.length
                  ? due.map((task) => task.title).join("; ")
                  : undefined
              }
              onClick={() => onSelect(key)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      <p className="calendar-hint">Select a day to filter the timeline.</p>
    </section>
  );
}
