import "./PlaceholderPage.css";

export default function PlaceholderPage({ title, description }) {
  return (
    <div className="placeholder">
      <h1 className="placeholder__title">{title}</h1>
      <p className="placeholder__desc">{description}</p>
    </div>
  );
}
