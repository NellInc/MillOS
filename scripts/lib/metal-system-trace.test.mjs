import { describe, expect, it } from 'vitest';
import { numericMetalRows, ownedGpuPid } from './metal-system-trace.mjs';

describe('owned hosted Metal trace', () => {
  it('requires the exact unique GPU process, never an unrelated or inferred PID', () => {
    expect(
      ownedGpuPid([
        { type: 'browser', id: 10 },
        { type: 'GPU', id: 11 },
      ])
    ).toBe(11);
    for (const processes of [
      [],
      [{ type: 'GPU', id: -1 }],
      [
        { type: 'GPU', id: 1 },
        { type: 'GPU', id: 2 },
      ],
    ]) {
      expect(() => ownedGpuPid(processes)).toThrow();
    }
  });

  it('exports only owned-PID numeric fields, resolving references without publishing private strings', () => {
    const xml = `<trace-query-result><node><schema>
      <col><mnemonic>start-time</mnemonic></col><col><mnemonic>process</mnemonic></col>
      <col><mnemonic>duration</mnemonic></col><col><mnemonic>command-buffer-id</mnemonic></col>
      <col><mnemonic>secret</mnemonic></col></schema>
      <row><start-time id="1" fmt="private path">1200</start-time>
        <process id="2" fmt="private-name"><pid>11</pid><name>secret-name</name></process>
        <duration>45</duration><uint64>0xabc</uint64><string>SECRET</string></row>
      <row><start-time ref="1"/><process ref="2"/><duration>50</duration><uint64>0xdef</uint64><string>SECRET</string></row>
      <row><start-time>1300</start-time><process><pid>12</pid></process><duration>60</duration></row>
      <row><start-time>1400</start-time><process><name>unknown</name></process><duration>70</duration></row>
      <row><start-time>1500</start-time><process><pid>11</pid><process><pid>12</pid></process></process><duration>80</duration></row>
      </node></trace-query-result>`;
    const result = numericMetalRows(xml, 11);
    expect(result.rows).toEqual([
      { index: 0, fields: { 'start-time': '1200', duration: '45', 'command-buffer-id': '0xabc' } },
      { index: 1, fields: { 'start-time': '1200', duration: '50', 'command-buffer-id': '0xdef' } },
    ]);
    expect(result.unownedRows).toBe(3);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|private|secret-name|unknown|1300|1400|1500/);
  });

  it('does not mistake empty or unsafe exports for a populated Metal trace', () => {
    expect(numericMetalRows('<trace-query-result/>', 11).rows).toEqual([]);
    expect(() => numericMetalRows('<broken>', 11)).toThrow();
    expect(() => numericMetalRows('<!DOCTYPE x><trace-query-result/>', 11)).toThrow();
  });

  it('retains ownership through referenced thread objects', () => {
    const xml = `<trace-query-result><node><schema>
      <col><mnemonic>start-time</mnemonic></col><col><mnemonic>thread</mnemonic></col></schema>
      <row><start-time>1200</start-time><thread id="t"><process><pid>11</pid></process></thread></row>
      <row><start-time>1300</start-time><thread ref="t"/></row></node></trace-query-result>`;
    expect(numericMetalRows(xml, 11).rows).toEqual([
      { index: 0, fields: { 'start-time': '1200' } },
      { index: 1, fields: { 'start-time': '1300' } },
    ]);
  });
});
