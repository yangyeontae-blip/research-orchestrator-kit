# Privacy and copyright boundary

Checked on 2026-10-09 (Asia/Seoul). This document records the project policy and is not legal advice.

## Personal data

The public repository must not contain:

- real study or interview records;
- research diaries, blog exports, or cloud-document indexes;
- plans containing identifiable participants or institutions;
- downloaded papers or parsed full text;
- local user-home paths, chat identifiers, phone numbers, or private email addresses;
- approval quotations or runtime ledgers.

`npm run audit` checks the publishable working tree, all reachable historical Git blobs, and commit author identities. The allowed commit identity is a project alias in `release-policy.json`. GitHub still displays the repository owner's account name because repository ownership is inherently public.

## APA Style 7th edition profile

`profiles/apa7.json` uses the name “APA Style” only to identify the optional compatibility target. It is an independent implementation and is not affiliated with or endorsed by the American Psychological Association.

The profile links to APA's official [Publication Manual 7th edition page](https://apastyle.apa.org/products/publication-manual-7th-edition), [paper-format guidance](https://apastyle.apa.org/style-grammar-guidelines/paper-format), [in-text citation guidance](https://apastyle.apa.org/style-grammar-guidelines/citations), and [reference guidance](https://apastyle.apa.org/style-grammar-guidelines/references), checked on 2026-10-09. It records high-level factual interoperability requirements in original wording. It does not reproduce the manual, official sample papers, logos, tables, figures, or instructional text.

APA Style covers scholarly presentation, citation, references, and reporting guidance. It does not supply one universal outline for every research proposal. The proposal sections in this toolkit are independently authored defaults, and the user's institution, department, instructor, supervisor, funder, or publisher requirements take precedence.

The MIT License covers the profile's original code and wording. It does not license APA publications, trademarks, website content, or sample files. Future maintainers must not add those files without a license that expressly permits redistribution.

## JQI profile

The optional profile refers to the Korean Association for Qualitative Inquiry's journal only to describe compatibility. It is independent and is not endorsed by or affiliated with the society.

The society's [submission guide](https://www.kaqi.or.kr/subList/32000001462) offers `JQI.hwp` and `JQI.doc` for authors to download and use when submitting. Its [submission rules](https://www.kaqi.or.kr/subList/32000001464) specify factual requirements such as page size, margins, type sizes, abstract length, and reference style. The pages do not state an open-source redistribution license for the template files.

For that reason this repository:

- paraphrases factual requirements and links to the official source;
- does not bundle the HWP/DOC template, journal logo, or sample manuscript;
- tells users to obtain the current template from the society;
- does not apply the MIT license to third-party material.

Under the Korean Copyright Act, a protected work is a creative expression of human thought or emotion ([Article 2](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1028885665)). Reproduction, public transmission, and distribution are rights of the author ([Articles 16–20](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029423511)). Quotation for research is permitted only within a justified extent and fair practice ([Article 28](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033063023)). Download availability alone does not establish permission to republish the complete source file.

If a future maintainer wants to bundle a journal template, obtain written redistribution permission or an explicit license first, record its scope in `THIRD_PARTY_NOTICES.md`, and keep it outside the MIT-covered files if required.
