# Security and privacy reports

Please use GitHub's private vulnerability-reporting or security-advisory interface for reports that may contain sensitive details. Do not put tokens, personal research material, participant information, local paths, or unpublished manuscripts in a public issue.

Before reporting a suspected release leak, run:

```bash
npm run audit
```

The audit covers current publishable files, reachable historical blobs, representative secret formats, local user paths, chat identifiers, contact details, prohibited document formats, and the repository's commit-identity policy. Automated matching can miss context-dependent personal information, so human review remains necessary.
