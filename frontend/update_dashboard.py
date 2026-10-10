import sys
file_path = './src/pages/dispatcher/DispatcherDashboard.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find header line indices
header_start = None
for i, line in enumerate(lines):
    if '<th className="p-3.5">Case #</th>' in line:
        header_start = i
        break
if header_start is None:
    print('Header not found')
    sys.exit(1)

# We expect the header to be a single <tr> with 7 <th> elements after modification.
# Let's replace lines[header_start:header_start+7] with new header.
new_header = '''                    <tr>
                      <th className="p-3.5">Case #</th>
                      <th className="p-3.5">Severity</th>
                      <th className="p-3.5">Patient</th>
                      <th className="p-3.5">Requirements</th>
                      <th className="p-3.5">Batch Outcome</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
'''
# Ensure we keep the same indentation level (20 spaces? Actually line starts with 20 spaces? Let's preserve the leading whitespace of the original line.
# The original line at header_start has 20 spaces? Let's check.
leading = lines[header_start][:len(lines[header_start]) - len(lines[header_start].lstrip())]
# Replace the 7 lines (from header_start to header_start+6 inclusive) with new_header lines split.
header_lines = new_header.strip('\\n').split('\\n')
# Ensure each line has the same leading whitespace.
for j in range(len(header_lines)):
    header_lines[j] = leading + header_lines[j]
# Now replace
lines[header_start:header_start+7] = [line + '\\n' for line in header_lines]

# Now find the row template. We'll look for the line containing '<td className="p-3.5">Severity</td>'? Actually we need to find the row inside the map.
# Let's search for '<td className="p-3.5">Severity</td>' which is in the row.
row_start = None
for i, line in enumerate(lines):
    if '<td className="p-3.5">Severity</td>' in line:
        row_start = i
        break
if row_start is None:
    print('Row not found')
    sys.exit(1)

# We need to locate the <tr> that contains this row. We'll search backwards for '<tr' before row_start.
tr_start = None
for i in range(row_start, -1, -1):
    if '<tr' in lines[i]:
        tr_start = i
        break
if tr_start is None:
    print('Could not find opening <tr>')
    sys.exit(1)

# Now we need to find the closing </tr> after row_start.
tr_end = None
for i in range(row_start, len(lines)):
    if '</tr>' in lines[i]:
        tr_end = i
        break
if tr_end is None:
    print('Could not find closing </tr>')
    sys.exit(1)

# Now we need to replace the content between tr_start and tr_end inclusive with new row.
# Let's construct the new row lines.
# We'll keep the same structure but insert a new <td> after the requirements td.
# Instead of trying to parse, we'll replace the whole block with a new version.
# We'll extract the lines from tr_start to tr_end and modify them.
# However, it's easier to replace the whole block with a known pattern from the original but with an extra td.
# Let's look at the original lines around that area to replicate.
# We'll write a new row block manually, preserving indentation.

# Determine the indentation of the <tr> line.
tr_line = lines[tr_start]
leading_tr = tr_line[:len(tr_line) - len(tr_line.lstrip())]
# The inner td lines likely have one more level of indentation (4 spaces?).
# We'll just construct new rows as follows:

new_row_block = '''                    <tr
                          key={e.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            isCurrent ? 'bg-teal-50/40' : ''
                          }`}
                        >
                          <td className="p-3.5 font-mono font-bold text-slate-800">
                            {e.case_number}
                          </td>
                          <td className="p-3.5">
                            <SeverityBadge severity={e.severity} />
                          </td>
                          <td className="p-3.5 font-medium text-slate-700">
                            {e.patient_age ? `${e.patient_age} yrs` : 'Unknown'}
                          </td>
                          <td className="p-3.5">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {e.requirements.map((r, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200"
                                >
                                  {r.resource_type} ×{r.quantity}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3.5">
                            {e.batch_outcome ? (
                              <>
                                <span className="font-medium text-slate-700">{e.batch_outcome}</span>
                                {e.batch_explanation && (
                                  <span className="ml-1 text-xs text-slate-400" title={e.batch_explanation}>
                                    (?)
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <StatusBadge status={e.status} />
                          </td>
                          <td className="p-3.5 text-right space-x-2">
                            <button
                              onClick={() => handleSelectEmergency(e)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                isCurrent
                                  ? 'bg-teal-600 text-white'
                                  : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200'
                              }`}
                            >
                              <Compass className="w-3 h-3" />
                              <span>{isCurrent ? 'Active on Map' : 'Select'}</span>
                            </button>
                            <Link
                              to={`/dispatcher/emergency/${e.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                            >
                              <Eye className="w-3 h-3" /> View
                            </Link>
                          </td>
                        </tr>
'''

# Ensure each line has the same leading whitespace as the original tr line.
new_row_lines = new_row_block.strip('\\n').split('\\n')
for j in range(len(new_row_lines)):
    new_row_lines[j] = leading_tr + new_row_lines[j]
# Replace the block
lines[tr_start:tr_end+1] = [line + '\\n' for line in new_row_lines]

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('File updated')