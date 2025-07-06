# Refactoring Roadmap

This document outlines the steps required to refactor the `notion-exporter` to a more event-driven architecture.

## Goals

* Improve scalability and resilience
* Decouple components for better testability and maintainability
* Enhance error handling and monitoring

## Prioritized Tasks

1. **Decouple the `Exporter` class:**
    * Create separate classes for each of the main tasks:
        * `WorkspaceMetadataExporter`
        * `UserExporter`
        * `DatabaseExporter`
        * `PageExporter`
        * `CommentExporter`
        * `FileReferenceExporter`
    * Use events to coordinate the different tasks.
2. **Introduce a message queue:**
    * Implement a message queue using a technology such as RabbitMQ or Kafka.
    * Publish events to the message queue for tasks such as page export.
    * Create worker processes to consume events from the message queue and handle the corresponding tasks.
3. **Refactor the `formatProperty` method:**
    * Identify any potential blocking operations within the `formatProperty` method and replace them with asynchronous alternatives.
4. **Improve error handling:**
    * Implement a more robust error handling strategy, including retry mechanisms and circuit breakers.
5. **Implement comprehensive testing:**
    * Write unit tests for each of the new classes.
    * Write integration tests to verify that the different parts of the export process work together correctly.
    * Write load tests to verify that the export process can handle a large number of pages and blocks.

## Technology Choices

*   **Message Queue:** In-memory
*   **Testing Framework:** Vitest
*   **Monitoring:** Prometheus and Grafana (optional)

## Deployment Pipeline

* Use a CI/CD pipeline to automate the deployment process.
* Implement rollback mechanisms to quickly revert to a previous version if necessary.

## Performance Benchmarks

* Measure the export time for different workspace sizes.
* Measure the number of requests per second that the export process can handle.
* Measure the memory usage of the export process.

## Code Examples

**Note:** A Notion API key is required to test the export.
To test, set the `NOTION_API_KEY` environment variable in `.env` or `notion-sync.yaml`.

### Event Schema

```json
{
  "type": "pageExportRequested",
  "payload": {
    "pageId": "...",
    "databaseId": "..."
  }
}
```

### API Contracts

TBD
