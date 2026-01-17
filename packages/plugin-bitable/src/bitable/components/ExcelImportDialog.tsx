import React, { useState, useCallback, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Button,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Checkbox,
    ScrollArea,
    cn,
    Alert,
    AlertDescription,
} from "@kn/ui";
import { Upload, FileSpreadsheet, ArrowRight, Plus, AlertCircle, Check } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, FieldType, RecordData } from "../../types";
import { generateFieldId, generateRecordId } from "../../utils/id";

interface ExcelImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fields: FieldConfig[];
    onImport: (newFields: FieldConfig[], newRecords: RecordData[]) => void;
}

interface ColumnMapping {
    excelColumn: number;
    excelHeader: string;
    bitableFieldId: string | null;
    createNew: boolean;
    newFieldType: FieldType;
}

interface ExcelPreviewData {
    headers: string[];
    rows: any[][];
    totalRows: number;
}

// 根据数据内容推断字段类型
const inferFieldType = (values: any[]): FieldType => {
    const sampleValues = values.filter(v => v !== null && v !== undefined && v !== '').slice(0, 20);

    if (sampleValues.length === 0) return FieldType.TEXT;

    // 检查是否全部是数字
    const allNumbers = sampleValues.every(v => {
        const num = Number(v);
        return !isNaN(num) && typeof v !== 'boolean';
    });
    if (allNumbers) return FieldType.NUMBER;

    // 检查是否全部是日期
    const allDates = sampleValues.every(v => {
        if (v instanceof Date) return true;
        const date = new Date(v);
        return !isNaN(date.getTime()) && String(v).match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/);
    });
    if (allDates) return FieldType.DATE;

    // 检查是否是布尔值
    const allBooleans = sampleValues.every(v => {
        const str = String(v).toLowerCase();
        return ['true', 'false', 'yes', 'no', '是', '否', '1', '0'].includes(str);
    });
    if (allBooleans) return FieldType.CHECKBOX;

    // 检查是否是邮箱
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const allEmails = sampleValues.every(v => emailPattern.test(String(v)));
    if (allEmails) return FieldType.EMAIL;

    // 检查是否是URL
    const urlPattern = /^https?:\/\/.+/;
    const allUrls = sampleValues.every(v => urlPattern.test(String(v)));
    if (allUrls) return FieldType.URL;

    // 检查是否适合作为选择字段（重复值较多）
    const uniqueValues = new Set(sampleValues.map(v => String(v)));
    if (uniqueValues.size <= 10 && sampleValues.length >= 5) {
        return FieldType.SELECT;
    }

    return FieldType.TEXT;
};

// 转换Excel值到bitable值
const convertValue = (value: any, fieldType: FieldType): any => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    switch (fieldType) {
        case FieldType.NUMBER:
        case FieldType.PROGRESS:
        case FieldType.RATING:
            const num = Number(value);
            return isNaN(num) ? 0 : num;

        case FieldType.CHECKBOX:
            const str = String(value).toLowerCase();
            return ['true', 'yes', '是', '1'].includes(str);

        case FieldType.DATE:
            if (value instanceof Date) {
                return value.toISOString();
            }
            // Excel日期是数字格式
            if (typeof value === 'number') {
                const date = XLSX.SSF.parse_date_code(value);
                if (date) {
                    return new Date(date.y, date.m - 1, date.d).toISOString();
                }
            }
            const parsed = new Date(value);
            return isNaN(parsed.getTime()) ? null : parsed.toISOString();

        case FieldType.MULTI_SELECT:
            // 尝试按逗号分割
            return String(value).split(',').map(s => s.trim()).filter(s => s);

        default:
            return String(value);
    }
};

export const ExcelImportDialog: React.FC<ExcelImportDialogProps> = ({
    open,
    onOpenChange,
    fields,
    onImport,
}) => {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
    const [excelData, setExcelData] = useState<ExcelPreviewData | null>(null);
    const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
    const [hasHeaderRow, setHasHeaderRow] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>('');

    // 可用于映射的字段（排除ID字段）
    const availableFields = useMemo(() => {
        return fields.filter(f => f.type !== FieldType.ID);
    }, [fields]);

    // 解析Excel文件
    const parseExcelFile = useCallback(async (file: File) => {
        setIsProcessing(true);
        setError(null);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });

            // 获取第一个工作表
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // 转换为二维数组
            const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                blankrows: false,
                defval: null,
                raw: false,
            });

            if (!jsonData || jsonData.length === 0) {
                throw new Error(t('bitable.excelImport.errors.emptyFile'));
            }

            const headers = hasHeaderRow
                ? jsonData[0].map((h, i) => h ? String(h) : `Column ${i + 1}`)
                : jsonData[0].map((_, i) => `Column ${i + 1}`);

            const rows = hasHeaderRow ? jsonData.slice(1) : jsonData;

            setExcelData({
                headers,
                rows,
                totalRows: rows.length,
            });

            // 初始化列映射
            const initialMappings: ColumnMapping[] = headers.map((header, index) => {
                // 尝试自动匹配字段
                const matchedField = availableFields.find(f =>
                    f.title.toLowerCase() === header.toLowerCase() ||
                    f.id.toLowerCase() === header.toLowerCase()
                );

                // 获取该列的所有值来推断类型
                const columnValues = rows.map(row => row[index]);
                const inferredType = inferFieldType(columnValues);

                return {
                    excelColumn: index,
                    excelHeader: header,
                    bitableFieldId: matchedField?.id || null,
                    createNew: !matchedField,
                    newFieldType: inferredType,
                };
            });

            setColumnMappings(initialMappings);
            setFileName(file.name);
            setStep('mapping');
        } catch (err) {
            setError(err instanceof Error ? err.message : t('bitable.excelImport.errors.parseError'));
        } finally {
            setIsProcessing(false);
        }
    }, [hasHeaderRow, availableFields, t]);

    // 处理文件选择
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            parseExcelFile(file);
        }
    }, [parseExcelFile]);

    // 处理拖放
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
            parseExcelFile(file);
        } else {
            setError(t('bitable.excelImport.errors.invalidFormat'));
        }
    }, [parseExcelFile, t]);

    // 更新列映射
    const updateMapping = useCallback((index: number, updates: Partial<ColumnMapping>) => {
        setColumnMappings(prev => prev.map((m, i) =>
            i === index ? { ...m, ...updates } : m
        ));
    }, []);

    // 执行导入
    const handleImport = useCallback(() => {
        if (!excelData) return;

        setIsProcessing(true);

        try {
            const newFields: FieldConfig[] = [];
            const fieldIdMap: Map<number, string> = new Map();

            // 处理映射，创建新字段
            columnMappings.forEach((mapping, index) => {
                if (mapping.createNew && mapping.excelHeader) {
                    const newField: FieldConfig = {
                        id: generateFieldId(),
                        title: mapping.excelHeader,
                        type: mapping.newFieldType,
                        width: 150,
                        isShow: true,
                    };

                    // 如果是选择类型，从数据中提取选项
                    if (mapping.newFieldType === FieldType.SELECT) {
                        const uniqueValues = new Set<string>();
                        excelData.rows.forEach(row => {
                            const val = row[index];
                            if (val !== null && val !== undefined && val !== '') {
                                uniqueValues.add(String(val));
                            }
                        });
                        newField.options = Array.from(uniqueValues).slice(0, 20).map((label, i) => ({
                            id: String(i + 1),
                            label,
                            color: ['#gray', '#blue', '#green', '#yellow', '#red', '#purple'][i % 6],
                        }));
                    }

                    newFields.push(newField);
                    fieldIdMap.set(index, newField.id);
                } else if (mapping.bitableFieldId) {
                    fieldIdMap.set(index, mapping.bitableFieldId);
                }
            });

            // 转换数据
            const newRecords: RecordData[] = excelData.rows.map((row, rowIndex) => {
                const record: RecordData = {
                    id: generateRecordId(),
                    createdTime: new Date().toISOString(),
                    updatedTime: new Date().toISOString(),
                };

                columnMappings.forEach((mapping, colIndex) => {
                    const fieldId = fieldIdMap.get(colIndex);
                    if (fieldId) {
                        const value = row[colIndex];
                        const fieldType = mapping.createNew
                            ? mapping.newFieldType
                            : fields.find(f => f.id === fieldId)?.type || FieldType.TEXT;
                        record[fieldId] = convertValue(value, fieldType);
                    }
                });

                return record;
            });

            onImport(newFields, newRecords);
            handleClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('bitable.excelImport.errors.importError'));
        } finally {
            setIsProcessing(false);
        }
    }, [excelData, columnMappings, fields, onImport, t]);

    // 关闭对话框
    const handleClose = useCallback(() => {
        setStep('upload');
        setExcelData(null);
        setColumnMappings([]);
        setError(null);
        setFileName('');
        onOpenChange(false);
    }, [onOpenChange]);

    // 获取字段类型名称
    const getFieldTypeName = (type: FieldType): string => {
        const typeNames: Record<FieldType, string> = {
            [FieldType.TEXT]: t('bitable.fieldTypes.text'),
            [FieldType.NUMBER]: t('bitable.fieldTypes.number'),
            [FieldType.SELECT]: t('bitable.fieldTypes.select'),
            [FieldType.MULTI_SELECT]: t('bitable.fieldTypes.multiSelect'),
            [FieldType.DATE]: t('bitable.fieldTypes.date'),
            [FieldType.CHECKBOX]: t('bitable.fieldTypes.checkbox'),
            [FieldType.PERSON]: t('bitable.fieldTypes.person'),
            [FieldType.ATTACHMENT]: 'Attachment',
            [FieldType.URL]: t('bitable.fieldTypes.url'),
            [FieldType.EMAIL]: t('bitable.fieldTypes.email'),
            [FieldType.PHONE]: t('bitable.fieldTypes.phone'),
            [FieldType.RATING]: t('bitable.fieldTypes.rating'),
            [FieldType.PROGRESS]: t('bitable.fieldTypes.progress'),
            [FieldType.FORMULA]: 'Formula',
            [FieldType.RELATION]: 'Relation',
            [FieldType.CREATED_TIME]: 'Created Time',
            [FieldType.UPDATED_TIME]: 'Updated Time',
            [FieldType.CREATED_BY]: 'Created By',
            [FieldType.UPDATED_BY]: 'Updated By',
            [FieldType.AUTO_NUMBER]: 'Auto Number',
            [FieldType.ID]: 'ID',
        };
        return typeNames[type] || type;
    };

    // 渲染上传步骤
    const renderUploadStep = () => (
        <div className="space-y-4">
            <div
                className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                    "hover:border-primary hover:bg-muted/50",
                    error && "border-destructive"
                )}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileSelect}
                />
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">
                    {t('bitable.excelImport.dropzone.title')}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                    {t('bitable.excelImport.dropzone.description')}
                </p>
                <Button variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    {t('bitable.excelImport.dropzone.button')}
                </Button>
            </div>

            <div className="flex items-center gap-2">
                <Checkbox
                    id="hasHeader"
                    checked={hasHeaderRow}
                    onCheckedChange={(checked) => setHasHeaderRow(checked as boolean)}
                />
                <Label htmlFor="hasHeader" className="text-sm">
                    {t('bitable.excelImport.hasHeaderRow')}
                </Label>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
        </div>
    );

    // 渲染映射步骤
    const renderMappingStep = () => (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <p className="font-medium">{fileName}</p>
                    <p className="text-sm text-muted-foreground">
                        {t('bitable.excelImport.recordCount', { count: excelData?.totalRows || 0 })}
                    </p>
                </div>
            </div>

            <ScrollArea className="h-[350px] pr-4">
                <div className="space-y-3">
                    {columnMappings.map((mapping, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{mapping.excelHeader}</p>
                                <p className="text-xs text-muted-foreground">
                                    {t('bitable.excelImport.sampleValue')}: {excelData?.rows[0]?.[index] ?? '-'}
                                </p>
                            </div>

                            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                            <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id={`create-${index}`}
                                        checked={mapping.createNew}
                                        onCheckedChange={(checked) => {
                                            updateMapping(index, {
                                                createNew: checked as boolean,
                                                bitableFieldId: checked ? null : mapping.bitableFieldId,
                                            });
                                        }}
                                    />
                                    <Label htmlFor={`create-${index}`} className="text-xs">
                                        {t('bitable.excelImport.createNewField')}
                                    </Label>
                                </div>

                                {mapping.createNew ? (
                                    <Select
                                        value={mapping.newFieldType}
                                        onValueChange={(value: FieldType) =>
                                            updateMapping(index, { newFieldType: value })
                                        }
                                    >
                                        <SelectTrigger className="h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={FieldType.TEXT}>{getFieldTypeName(FieldType.TEXT)}</SelectItem>
                                            <SelectItem value={FieldType.NUMBER}>{getFieldTypeName(FieldType.NUMBER)}</SelectItem>
                                            <SelectItem value={FieldType.SELECT}>{getFieldTypeName(FieldType.SELECT)}</SelectItem>
                                            <SelectItem value={FieldType.DATE}>{getFieldTypeName(FieldType.DATE)}</SelectItem>
                                            <SelectItem value={FieldType.CHECKBOX}>{getFieldTypeName(FieldType.CHECKBOX)}</SelectItem>
                                            <SelectItem value={FieldType.URL}>{getFieldTypeName(FieldType.URL)}</SelectItem>
                                            <SelectItem value={FieldType.EMAIL}>{getFieldTypeName(FieldType.EMAIL)}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Select
                                        value={mapping.bitableFieldId || 'skip'}
                                        onValueChange={(value) =>
                                            updateMapping(index, {
                                                bitableFieldId: value === 'skip' ? null : value
                                            })
                                        }
                                    >
                                        <SelectTrigger className="h-8">
                                            <SelectValue placeholder={t('bitable.excelImport.selectField')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="skip">
                                                <span className="text-muted-foreground">
                                                    {t('bitable.excelImport.skipColumn')}
                                                </span>
                                            </SelectItem>
                                            {availableFields.map((field) => (
                                                <SelectItem key={field.id} value={field.id}>
                                                    {field.title}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
        </div>
    );

    // 统计要导入的信息
    const importSummary = useMemo(() => {
        const newFieldsCount = columnMappings.filter(m => m.createNew).length;
        const mappedFieldsCount = columnMappings.filter(m => !m.createNew && m.bitableFieldId).length;
        const skippedCount = columnMappings.filter(m => !m.createNew && !m.bitableFieldId).length;
        return { newFieldsCount, mappedFieldsCount, skippedCount };
    }, [columnMappings]);

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {step === 'upload'
                            ? t('bitable.excelImport.title')
                            : t('bitable.excelImport.mappingTitle')}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'upload'
                            ? t('bitable.excelImport.description')
                            : t('bitable.excelImport.mappingDescription')}
                    </DialogDescription>
                </DialogHeader>

                {step === 'upload' && renderUploadStep()}
                {step === 'mapping' && renderMappingStep()}

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    {step === 'mapping' && (
                        <>
                            <div className="flex-1 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                    <Plus className="h-3 w-3" />
                                    {t('bitable.excelImport.summary.newFields', { count: importSummary.newFieldsCount })}
                                </span>
                                <span className="mx-2">·</span>
                                <span className="inline-flex items-center gap-1">
                                    <Check className="h-3 w-3" />
                                    {t('bitable.excelImport.summary.mapped', { count: importSummary.mappedFieldsCount })}
                                </span>
                            </div>
                            <Button variant="outline" onClick={() => setStep('upload')}>
                                {t('bitable.actions.cancel')}
                            </Button>
                            <Button onClick={handleImport} disabled={isProcessing}>
                                {isProcessing ? t('bitable.excelImport.importing') : t('bitable.excelImport.importButton')}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
