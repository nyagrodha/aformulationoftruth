import { Switch, Route } from 'wouter';
import HomePage from './pages/home';
import SentPage from './pages/sent';
import NotFoundPage from './pages/not-found';

export default function App() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/sent" component={SentPage} />
      <Route component={NotFoundPage} />
    </Switch>
  );
}
