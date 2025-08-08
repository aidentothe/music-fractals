<script>
  import '../app.css';
  import { injectAnalytics } from '@vercel/analytics/sveltekit';
  
  injectAnalytics();
</script>

<slot />
