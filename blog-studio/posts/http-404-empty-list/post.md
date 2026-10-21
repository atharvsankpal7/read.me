---
title: Should an Empty List Be a 404?
subtitle: While reading a legacy codebase, I found an interesting pattern for handling an empty list for a requested query on filters. Everything boils down to the first principles.
date: 2026-04-26
tags:
  - HTTP
  - APIs
  - Backend
---

While reading a legacy codebase, I found an interesting pattern for handling an empty list for a requested query on filters.

If the frontend requests a list of items with specific filters and the database has no items, then the backend was sending a `404 Not Found` error. On the intuition sense this seems correct, but semantically how correct is it?

## What each status code means

It all boils down to the [HTTP standards](https://www.rfc-editor.org/rfc/rfc9110#name-status-codes) for sending the response. Every response code depicts a state in the system:

- [**2xx**](https://www.rfc-editor.org/rfc/rfc9110#name-successful-2xx) means the request-response lifecycle was correctly completed.
- [**3xx**](https://www.rfc-editor.org/rfc/rfc9110#name-redirection-3xx) means it was completed correctly but with some changes that the client didn't know but the server did, like redirection.
- [**4xx**](https://www.rfc-editor.org/rfc/rfc9110#name-client-error-4xx) means the client side did some mistake while making the request, let it be trying to access the wrong entity or sending an invalid request body for the server to process it correctly.
- [**5xx**](https://www.rfc-editor.org/rfc/rfc9110#name-server-error-5xx) is for something going wrong at the server side, like [`503`](https://www.rfc-editor.org/rfc/rfc9110#name-503-service-unavailable) meaning that the server doesn't have enough resources to process the request.

## So what is going on?

So in the above case, what is going on? The frontend did send the correct request headers, was authenticated and was accessing the correct set of entities. So there is no need to send 4xx errors, including [`404`](https://www.rfc-editor.org/rfc/rfc9110#name-404-not-found), since the client is not asking for a specific entity with a unique identifier like a UUID for the backend to say that entity is not found. The client is asking for a list of entities that have certain properties.

Still, the backend was sending the 404 status code, and the frontend was handling that error as a valid response by doing some glue code on the frontend, rendering the empty list message on hitting that status code for that given component.

::figure emptylist The same filtered request, answered two ways. Switch between the legacy 404 and a 200 with an empty list, then see what happens when a real 404 comes back.

> [!IMPORTANT]
> The handling of the API errors should happen in the API layer, not in the component layer, as the error handling should include showing a generalized error message to ensure security.

## What should have been the approach?

Even if the backend finds that we have no entities matching the filters that the frontend wants, it is still a valid request. So the backend should have sent a [`200`](https://www.rfc-editor.org/rfc/rfc9110#name-200-ok) status code (on subsequent requests it might be automatically converted to [`304`](https://www.rfc-editor.org/rfc/rfc9110#name-304-not-modified)).

```http
GET /items?color=purple&size=xs HTTP/1.1

HTTP/1.1 200 OK
Content-Type: application/json

[]
```

Everything boils down to the first principles.
