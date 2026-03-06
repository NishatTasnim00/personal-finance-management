const AuthLayout = ({ children, title }) => {
  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center px-4">
      <div className="max-w-md w-full flex flex-col items-center">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">Finance Tracker</h1>
          <p className="text-base-content/70 mt-2">{title}</p>
        </div>
        <div className="card bg-base-100 w-full max-w-sm shrink-0 shadow-2xl">
          <div className="card-body">{children}</div>
        </div>
      </div>
    </div>
  );
}
export default AuthLayout;