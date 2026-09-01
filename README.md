# DiagramAR

Herramienta educativa para crear Diagramas de Entidad-Relación con notación Crow's Foot (Pata de cuervo).

## Funcionalidades

El sistema está preparado para crear DER con los siguientes elementos:

- Entidades
- Atributos
  - Tipos de datos
  - PK / FK / NN / UQ
- Entidades débiles
- Relaciones identificadoras
- Relaciones autoreferenciadas
- Jerarquía de Generalización (notación Mannino)

### Opciones de archivo

- Importar diagrama desde JSON
- Guardar cambios en el archivo importado
- Exportar copia en JSON
- Exportar imagen PNG
- Modo claro / oscuro

<img width="2455" height="2103" alt="DiagramAR preview" src="https://github.com/user-attachments/assets/247f8b2f-eb8a-44f5-82c8-2d8b836501f1" />

## Compatibilidad

La mayoría de las funciones de DiagramAR funcionan en cualquier navegador moderno.

La excepción es el **trabajo con archivos**: las funciones de **Abrir** (diálogo nativo del sistema) y **Guardar** (sobrescribir el archivo original) requieren un navegador basado en **Chrome/Chromium**, ya que dependen de la [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API).

En **Firefox, Safari y otros navegadores**:
- Se puede importar un archivo `.json` usando el selector de archivos clásico
- Se puede trabajar normalmente sobre el diagrama
- La función de **Guardar** descarga una copia del archivo con los últimos cambios en lugar de sobrescribir el original
