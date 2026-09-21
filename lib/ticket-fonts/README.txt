Fonts for the booking ticket image (lib/booking-ticket.ts)

TicketSans-Regular.ttf, TicketSans-Bold.ttf and TicketSerif-Bold.ttf are Latin-only subsets (Basic Latin, Latin-1,
Latin Extended-A, common punctuation, euro sign) of Liberation Sans and Liberation Serif 2.x, kerning kept, hinting
removed, about 22 KB each. Servers that draw the ticket have no fonts of their own.

Liberation is licensed under the SIL Open Font License 1.1 (LICENSE.txt). Because the fonts were modified, the
Reserved Font Name "Liberation" is not used: the families are renamed "YME Ticket Sans" and "YME Ticket Serif".

To rebuild (fonttools): pyftsubset LiberationSans-Regular.ttf --unicodes=U+0020-007E,U+00A0-00FF,U+0100-017F,
U+2010-2015,U+2018-201F,U+2022,U+2026,U+20AC,U+2212 --layout-features=kern --no-hinting --desubroutinize
--name-IDs= --notdef-outline, then rename the family in the name table.
Characters outside these ranges (for example Greek or Cyrillic names) will not draw on the ticket.
