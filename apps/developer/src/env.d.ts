declare namespace App {
  interface Locals {
    /**
     * The invitation a request's pass belongs to, set by the middleware on the
     * sign-up paths. The sign-up page starts its address field with it, so the
     * address never has to travel in the page's URL. Unset without a valid pass.
     */
    invitation?: { email: string };
  }
}
